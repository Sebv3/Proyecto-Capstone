import type { ChatMessage } from '../api/chat';

export function appendUniqueById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return added.length ? [...current, ...added] : current;
}

// The server snapshot is authoritative, including edits and deletions. Reuse only
// identical messages so polling does not invalidate every memoized message row.
export function shareChatSnapshot(current: ChatMessage[], snapshot: ChatMessage[]): ChatMessage[] {
  const previous = new Map(current.map((item) => [item.id, item]));
  const unique = new Map(snapshot.map((item) => [item.id, item]));
  const next = [...unique.values()].map((item) => {
    const old = previous.get(item.id);
    return old && old.conversacion_id === item.conversacion_id && old.autor_id === item.autor_id
      && old.contenido === item.contenido && old.creado_en === item.creado_en && old.editado_en === item.editado_en
      ? old : item;
  });
  return next.length === current.length && next.every((item, index) => item === current[index]) ? current : next;
}
