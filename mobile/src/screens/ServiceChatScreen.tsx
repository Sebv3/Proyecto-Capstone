import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { openChat, readChat, sendChatMessage, editChatMessage, deleteChatMessage, chatError, isChatClosed, newMessageId, type ChatPage, type ChatMessage } from '../api/chat';
import { shareChatSnapshot } from '../services/listData';

type ChatMeta = Pick<ChatPage, 'conversacion_id' | 'contraparte_nombre' | 'servicio_nombre' | 'has_more'>;
const messageKey = (message: ChatMessage) => message.id;
const messageAnchor = { minIndexForVisible: 0, autoscrollToTopThreshold: 60 };
const MessageSeparator = () => <View style={{ height: 12 }} />;
const MessageBubble = memo(function MessageBubble({ item, mine, busy, onEdit, onDelete }: {
  item: ChatMessage; mine: boolean; busy: boolean;
  onEdit: (item: ChatMessage) => void; onDelete: (id: string) => void;
}) {
  return <View style={[s.bubble, mine ? s.mine : s.theirs]}>
    <Text selectable style={[s.message, mine && s.white]}>{item.contenido}</Text>
    <Text style={[s.time, mine && s.white]}>{new Date(item.creado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}{item.editado_en ? ' · editado' : ''}</Text>
    {mine && <View style={s.tools}>
      <Pressable accessibilityRole="button" accessibilityLabel="Editar mensaje" disabled={busy} onPress={() => onEdit(item)}><Text style={s.white}>Editar</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Eliminar mensaje" disabled={busy} onPress={() => onDelete(item.id)}><Text style={s.white}>Eliminar</Text></Pressable>
    </View>}
  </View>;
});

export function ServiceChatScreen({ bookingId, onBack }: { bookingId: string; onBack: () => void }) {
  const { user, withAccessToken } = useAuth();
  const request = useRef(withAccessToken); request.current = withAccessToken;
  const [page, setPage] = useState<ChatMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const reading = useRef(false);
  const mutationVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{ id: string; text: string } | null>(null);
  const scroll = useRef<FlatList<ChatMessage> | null>(null);
  usePreventRemove(busy, () => {});
  const updatePage = useCallback((next: ChatPage) => setPage((previous) => {
    const meta: ChatMeta = { conversacion_id: next.conversacion_id, contraparte_nombre: next.contraparte_nombre,
      servicio_nombre: next.servicio_nombre, has_more: next.has_more };
    return previous && previous.conversacion_id === meta.conversacion_id && previous.contraparte_nombre === meta.contraparte_nombre
      && previous.servicio_nombre === meta.servicio_nombre && previous.has_more === meta.has_more ? previous : meta;
  }), []);

  function failure(value: unknown) {
    setError(chatError(value));
    if (isChatClosed(value)) { setClosed(true); setPage(null); setMessages([]); setText(''); setEditing(null); setDeleting(null); pending.current = null; }
  }
  async function refresh(older = false) {
    const active = controller.current;
    if (!active || active.signal.aborted || reading.current || lock.current || closed || loading) return;
    reading.current = true;
    if (older) setOlderLoading(true);
    const version = mutationVersion.current;
    try {
      let result = await request.current((token) => readChat(token, bookingId, older ? messages.length : 0, active.signal));
      const batches = [result.items];
      if (!older) {
        let offset = result.items.length;
        while (result.has_more && offset < messages.length && !active.signal.aborted) {
          result = await request.current((token) => readChat(token, bookingId, offset, active.signal));
          batches.push(result.items); offset += result.items.length;
          if (!result.items.length) break;
        }
      }
      const refreshed = batches.reverse().flat();
      if (!active.signal.aborted && version === mutationVersion.current) {
        updatePage(result); setError('');
        setMessages((previous) => {
          if (!older) return shareChatSnapshot(previous, refreshed);
          const known = new Set(previous.map((item) => item.id));
          return shareChatSnapshot(previous, [...result.items.filter((item) => !known.has(item.id)), ...previous]);
        });
      }
    } catch (value) { if (!active.signal.aborted) failure(value); }
    finally { reading.current = false; if (!active.signal.aborted) setOlderLoading(false); }
  }
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useFocusEffect(useCallback(() => {
    const active = new AbortController(); controller.current = active;
    setLoading(true); setOlderLoading(false); setError(''); setClosed(false); setMessages([]); setPage(null);
    setText(''); setEditing(null); setDeleting(null); pending.current = null;
    void request.current((token) => openChat(token, bookingId, active.signal))
      .then((result) => { if (!active.signal.aborted) { updatePage(result); setMessages(result.items); } })
      .catch((value) => { if (!active.signal.aborted) failure(value); })
      .finally(() => { if (!active.signal.aborted) setLoading(false); });
    const canPoll = () => Platform.OS === 'web'
      ? typeof document !== 'undefined' && document.visibilityState === 'visible'
      : AppState.currentState === 'active';
    const poll = () => { if (canPoll()) void refreshRef.current(); };
    const timer = setInterval(poll, 3_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    const webDocument = Platform.OS === 'web' && typeof document !== 'undefined' ? document : null;
    webDocument?.addEventListener('visibilitychange', poll);
    return () => {
      active.abort(); clearInterval(timer); appState.remove();
      webDocument?.removeEventListener('visibilitychange', poll);
      setMessages([]); setPage(null);
    };
  }, [bookingId, retry, updatePage]));

  async function act() {
    if (lock.current || loading || closed || !page?.conversacion_id) return;
    if (!deleting && (!text.trim() || text.trim().length > 2000)) { setError('Escribe un mensaje de 1 a 2000 caracteres.'); return; }
    lock.current = true; mutationVersion.current += 1; setBusy(true); setError('');
    try {
      if (deleting) {
        await request.current((token) => deleteChatMessage(token, bookingId, deleting));
        setMessages((items) => items.filter((item) => item.id !== deleting)); setDeleting(null);
      } else {
        if (!pending.current || pending.current.text !== text.trim()) pending.current = { id: newMessageId(), text: text.trim() };
        const draft = pending.current;
        const result = await request.current((token) => editing
          ? editChatMessage(token, bookingId, editing, text)
          : sendChatMessage(token, bookingId, draft.id, draft.text));
        setMessages((items) => [...items.filter((item) => item.id !== result.id), result]
          .sort((a, b) => a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id)));
        setText(''); setEditing(null); pending.current = null;
        scroll.current?.scrollToOffset({ offset: 0, animated: true });
      }
    } catch (value) { failure(value); }
    finally { lock.current = false; setBusy(false); }
  }
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const startEditing = useCallback((item: ChatMessage) => { setEditing(item.id); setDeleting(null); setText(item.contenido); }, []);
  const startDeleting = useCallback((id: string) => { setDeleting(id); setEditing(null); setText(''); }, []);
  const renderMessage = useCallback(({ item }: ListRenderItemInfo<ChatMessage>) => <MessageBubble item={item}
    mine={item.autor_id === user?.id} busy={busy} onEdit={startEditing} onDelete={startDeleting} />, [user?.id, busy, startEditing, startDeleting]);
  return <SafeAreaView style={s.page}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver al servicio" disabled={busy} onPress={onBack} style={s.back}><Ionicons name="arrow-back" size={22} color="#162B22" /></Pressable>
      <View style={s.flex}><Text style={s.title}>{page?.contraparte_nombre ?? 'Chat del servicio'}</Text><Text style={s.hint}>{page?.servicio_nombre ?? 'Conversación privada'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar chat" disabled={busy || loading || closed} onPress={() => page ? void refresh() : setRetry((n) => n + 1)} style={s.back}><Ionicons name="refresh" size={20} color="#087D56" /></Pressable>
    </View>
    <Text style={s.notice}>Este chat se elimina al completar, cancelar o rechazar el servicio.</Text>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList ref={scroll} data={newestFirst} inverted renderItem={renderMessage} keyExtractor={messageKey}
        initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} removeClippedSubviews={false}
        maintainVisibleContentPosition={messageAnchor} ItemSeparatorComponent={MessageSeparator}
        keyboardShouldPersistTaps="handled" contentContainerStyle={s.messages}
        ListEmptyComponent={loading ? <ActivityIndicator color="#087D56" /> : !closed && page ? <View style={s.empty}>
          <Ionicons name="chatbubbles-outline" size={40} color="#087D56" /><Text style={s.title}>Coordina tu servicio</Text><Text style={s.hint}>Envía el primer mensaje para acordar los detalles.</Text>
        </View> : null}
        ListFooterComponent={page?.has_more ? <Pressable accessibilityRole="button" disabled={busy || olderLoading} onPress={() => void refresh(true)} style={s.older}>
          {olderLoading ? <ActivityIndicator color="#087D56" /> : <Text style={s.link}>Ver mensajes anteriores</Text>}
        </Pressable> : null} />
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {closed && <Pressable accessibilityRole="button" onPress={onBack} style={s.older}><Text style={s.link}>Volver al servicio</Text></Pressable>}
      {!closed && page?.conversacion_id && <View style={s.composer}>
        {(editing || deleting) && <View style={s.tools}><Text style={s.hint}>{deleting ? '¿Eliminar este mensaje definitivamente?' : 'Editando mensaje'}</Text><Pressable disabled={busy} onPress={() => { setEditing(null); setDeleting(null); setText(''); }}><Text style={s.link}>Cancelar</Text></Pressable></View>}
        <View style={s.row}>{!deleting && <TextInput accessibilityLabel="Mensaje" editable={!busy} value={text} onChangeText={setText} placeholder="Escribe un mensaje…" maxLength={2000} multiline style={s.input} />}
          <Pressable accessibilityRole="button" accessibilityLabel={deleting ? 'Confirmar eliminación' : editing ? 'Guardar mensaje' : 'Enviar mensaje'} disabled={busy || (!deleting && !text.trim())} onPress={() => void act()} style={[s.send, (busy || (!deleting && !text.trim())) && s.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name={deleting ? 'trash-outline' : editing ? 'checkmark' : 'send'} size={22} color="#FFFFFF" />}</Pressable>
        </View>
      </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F6F5' }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  back: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#162B22', fontSize: 16, fontWeight: '800' }, hint: { color: '#52695C', fontSize: 12, lineHeight: 18 },
  notice: { paddingHorizontal: 18, paddingBottom: 12, color: '#52695C', fontSize: 12, lineHeight: 18 },
  messages: { padding: 16, width: '100%', maxWidth: 680, alignSelf: 'center', flexGrow: 1 },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 10 }, bubble: { padding: 14, borderRadius: 18, maxWidth: '85%', gap: 6 },
  mine: { backgroundColor: '#087D56', alignSelf: 'flex-end', borderBottomRightRadius: 5 }, theirs: { backgroundColor: '#FFFFFF', alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  message: { fontSize: 15, lineHeight: 22, color: '#162B22' }, white: { color: '#FFFFFF' }, time: { fontSize: 12, color: '#52695C' },
  tools: { flexDirection: 'row', justifyContent: 'space-between', gap: 20, paddingVertical: 6 }, composer: { padding: 14, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E0E8E3', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, input: { flex: 1, minHeight: 48, maxHeight: 120, padding: 12, borderRadius: 14, backgroundColor: '#F3F6F5', color: '#162B22', fontSize: 15 },
  send: { height: 48, minWidth: 48, borderRadius: 14, backgroundColor: '#087D56', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 }, error: { color: '#A74444', padding: 14, fontSize: 14, lineHeight: 20 }, link: { color: '#087D56', fontWeight: '700' }, older: { padding: 14, alignItems: 'center' },
});
