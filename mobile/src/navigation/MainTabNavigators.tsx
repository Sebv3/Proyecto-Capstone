import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import type { WorkerVerification } from '../api/workerVerification';
import { ClientHomeScreen } from '../screens/ClientHomeScreen';
import { ComingSoonScreen } from '../screens/ComingSoonScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkerHomeScreen } from '../screens/WorkerHomeScreen';
import { PublishServiceScreen } from '../screens/PublishServiceScreen';
import { ServiceSearchScreen } from '../screens/ServiceSearchScreen';
import { ServiceDetailScreen } from '../screens/ServiceDetailScreen';
import { WorkerCertificationsScreen } from '../screens/WorkerCertificationsScreen';
import { ClientMapScreen } from '../screens/ClientMapScreen';
import { ScheduleServiceScreen } from '../screens/ScheduleServiceScreen';
import { WorkerAgendaScreen } from '../screens/WorkerAgendaScreen';
import { BookingRequestsScreen } from '../screens/BookingRequestsScreen';
import { BookingTrackingScreen } from '../screens/BookingTrackingScreen';
import type { BookingRole } from '../services/bookingTracking';

type RequestsStackParams = { BookingList: undefined; BookingTracking: { bookingId: string } };
const RequestsStack = createNativeStackNavigator<RequestsStackParams>();
function RequestsNavigator({ role }: { role: BookingRole }) {
  return <RequestsStack.Navigator screenOptions={{ headerShown: false }}>
    <RequestsStack.Screen name="BookingList">{({ navigation }) => <BookingRequestsScreen role={role}
      onBooking={(bookingId) => navigation.navigate('BookingTracking', { bookingId })} />}</RequestsStack.Screen>
    <RequestsStack.Screen name="BookingTracking">{({ navigation, route }) => <BookingTrackingScreen role={role}
      bookingId={route.params.bookingId} onBack={() => navigation.goBack()} />}</RequestsStack.Screen>
  </RequestsStack.Navigator>;
}
function WorkerAgendaHome({ onBooking }: { onBooking: (id: string) => void }) {
  const [reservations, setReservations] = useState(false);
  return reservations ? <BookingRequestsScreen role="TRABAJADOR" agenda onBooking={onBooking} onAvailability={() => setReservations(false)} />
    : <WorkerAgendaScreen onReservations={() => setReservations(true)} />;
}
function WorkerAgendaNavigator() {
  return <RequestsStack.Navigator screenOptions={{ headerShown: false }}>
    <RequestsStack.Screen name="BookingList">{({ navigation }) => <WorkerAgendaHome
      onBooking={(bookingId) => navigation.navigate('BookingTracking', { bookingId })} />}</RequestsStack.Screen>
    <RequestsStack.Screen name="BookingTracking">{({ navigation, route }) => <BookingTrackingScreen role="TRABAJADOR"
      bookingId={route.params.bookingId} onBack={() => navigation.goBack()} />}</RequestsStack.Screen>
  </RequestsStack.Navigator>;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: 68,
    paddingTop: 7,
    paddingBottom: 7,
    backgroundColor: '#FFFFFF',
    borderTopColor: '#DCE6E1',
    borderTopWidth: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  label: { fontSize: 11, fontWeight: '600' },
});

const commonScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: '#00875A',
  tabBarInactiveTintColor: '#82918B',
  tabBarHideOnKeyboard: true,
  tabBarLabelStyle: styles.label,
  tabBarStyle: styles.tabBar,
};

type ClientTabParamList = {
  ClientHome: undefined;
  ClientSearch: { categoryId?: string; requestKey: number } | undefined;
  ClientMap: undefined;
  ClientRequests: undefined;
  ClientProfile: undefined;
};

const ClientTab = createBottomTabNavigator<ClientTabParamList>();

type ClientHomeStackParamList = {
  ClientDashboard: undefined;
  ServiceDetail: { serviceId: string };
  ScheduleService: { serviceId: string };
};
type ClientSearchStackParamList = {
  ServiceSearch: undefined;
  ServiceDetail: { serviceId: string };
  ScheduleService: { serviceId: string };
};
const ClientHomeStack = createNativeStackNavigator<ClientHomeStackParamList>();
const ClientSearchStack = createNativeStackNavigator<ClientSearchStackParamList>();
type ClientMapStackParamList = {
  CoverageMap: undefined;
  ServiceDetail: { serviceId: string };
  ScheduleService: { serviceId: string };
};
const ClientMapStack = createNativeStackNavigator<ClientMapStackParamList>();

function ClientMapNavigator() {
  return <ClientMapStack.Navigator screenOptions={{ headerShown: false }}>
    <ClientMapStack.Screen name="CoverageMap">
      {({ navigation }) => <ClientMapScreen onService={(serviceId) => navigation.navigate('ServiceDetail', { serviceId })} />}
    </ClientMapStack.Screen>
    <ClientMapStack.Screen name="ServiceDetail">
      {({ navigation, route }) => <ServiceDetailScreen serviceId={route.params.serviceId} onBack={() => navigation.goBack()}
        onSchedule={() => navigation.navigate('ScheduleService', { serviceId: route.params.serviceId })} />}
    </ClientMapStack.Screen>
    <ClientMapStack.Screen name="ScheduleService" options={{ gestureEnabled: false }}>
      {({ navigation, route }) => <ScheduleServiceScreen serviceId={route.params.serviceId} onBack={() => navigation.goBack()} />}
    </ClientMapStack.Screen>
  </ClientMapStack.Navigator>;
}

function ClientHomeNavigator({ onSearch }: { onSearch: (categoryId?: string) => void }) {
  return <ClientHomeStack.Navigator screenOptions={{ headerShown: false }}>
    <ClientHomeStack.Screen name="ClientDashboard">
      {({ navigation }) => <ClientHomeScreen onSearch={() => onSearch()} onCategory={onSearch}
        onService={(serviceId) => navigation.navigate('ServiceDetail', { serviceId })} />}
    </ClientHomeStack.Screen>
    <ClientHomeStack.Screen name="ServiceDetail">
      {({ navigation, route }) => <ServiceDetailScreen serviceId={route.params.serviceId} onBack={() => navigation.goBack()}
        onSchedule={() => navigation.navigate('ScheduleService', { serviceId: route.params.serviceId })} />}
    </ClientHomeStack.Screen>
    <ClientHomeStack.Screen name="ScheduleService" options={{ gestureEnabled: false }}>
      {({ navigation, route }) => <ScheduleServiceScreen serviceId={route.params.serviceId} onBack={() => navigation.goBack()} />}
    </ClientHomeStack.Screen>
  </ClientHomeStack.Navigator>;
}

function ClientSearchNavigator({ initialCategoryId }: { initialCategoryId?: string }) {
  return <ClientSearchStack.Navigator screenOptions={{ headerShown: false }}>
    <ClientSearchStack.Screen name="ServiceSearch">
      {({ navigation }) => <ServiceSearchScreen initialCategoryId={initialCategoryId}
        onService={(serviceId) => navigation.navigate('ServiceDetail', { serviceId })} />}
    </ClientSearchStack.Screen>
    <ClientSearchStack.Screen name="ServiceDetail">
      {({ navigation, route }) => <ServiceDetailScreen serviceId={route.params.serviceId} onBack={() => navigation.goBack()}
        onSchedule={() => navigation.navigate('ScheduleService', { serviceId: route.params.serviceId })} />}
    </ClientSearchStack.Screen>
    <ClientSearchStack.Screen name="ScheduleService" options={{ gestureEnabled: false }}>
      {({ navigation, route }) => <ScheduleServiceScreen serviceId={route.params.serviceId} onBack={() => navigation.goBack()} />}
    </ClientSearchStack.Screen>
  </ClientSearchStack.Navigator>;
}

export function ClientMainTabs() {
  return <ClientTab.Navigator initialRouteName="ClientHome" screenOptions={commonScreenOptions}>
    <ClientTab.Screen name="ClientHome" options={{
      title: 'Inicio', tabBarIcon: tabIcon('home', 'home-outline'),
    }}>
      {({ navigation }) => <ClientHomeNavigator onSearch={(categoryId) => navigation.navigate('ClientSearch', { categoryId, requestKey: Date.now() })} />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientSearch" options={{
      title: 'Buscar', tabBarIcon: tabIcon('search', 'search-outline'),
    }}>
      {({ route }) => <ClientSearchNavigator key={route.params?.requestKey ?? 'default'} initialCategoryId={route.params?.categoryId} />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientMap" options={{
      title: 'Mapa', tabBarIcon: tabIcon('map', 'map-outline'),
    }}>
      {() => <ClientMapNavigator />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientRequests" options={{
      title: 'Solicitudes', tabBarIcon: tabIcon('list', 'list-outline'),
    }}>
      {() => <RequestsNavigator role="CLIENTE" />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientProfile" component={ProfileScreen} options={{
      title: 'Perfil', tabBarIcon: tabIcon('person', 'person-outline'),
    }} />
  </ClientTab.Navigator>;
}

type WorkerTabParamList = {
  WorkerHome: undefined;
  WorkerAgenda: undefined;
  WorkerRequests: undefined;
  WorkerEarnings: undefined;
  WorkerProfile: undefined;
};

const WorkerTab = createBottomTabNavigator<WorkerTabParamList>();

export type WorkerHomeStackParamList = {
  WorkerDashboard: { publishedServiceName?: string; updatedServiceName?: string } | undefined;
  PublishService: { serviceId?: string } | undefined;
  WorkerCertifications: { categoryId?: string } | undefined;
};
const WorkerHomeStack = createNativeStackNavigator<WorkerHomeStackParamList>();

function WorkerHomeNavigator({ verification, onRefresh }: {
  verification: WorkerVerification; onRefresh: () => void;
}) {
  return <WorkerHomeStack.Navigator screenOptions={{ headerShown: false }}>
    <WorkerHomeStack.Screen name="WorkerDashboard">
      {({ navigation, route }) => <WorkerHomeScreen verification={verification} onRefresh={onRefresh}
        onPublish={() => navigation.navigate('PublishService')}
        onEdit={(serviceId) => navigation.navigate('PublishService', { serviceId })}
        onCertifications={() => navigation.navigate('WorkerCertifications')}
        publishedServiceName={route.params?.publishedServiceName}
        updatedServiceName={route.params?.updatedServiceName}
        onDismissSuccess={() => navigation.setParams({ publishedServiceName: undefined, updatedServiceName: undefined })} />}
    </WorkerHomeStack.Screen>
    <WorkerHomeStack.Screen name="PublishService" component={PublishServiceScreen} options={{ gestureEnabled: false }} />
    <WorkerHomeStack.Screen name="WorkerCertifications" component={WorkerCertificationsScreen} options={{ gestureEnabled: false }} />
  </WorkerHomeStack.Navigator>;
}

export function WorkerMainTabs({
  verification, onRefresh,
}: { verification: WorkerVerification; onRefresh: () => void }) {
  return <WorkerTab.Navigator initialRouteName="WorkerHome" screenOptions={commonScreenOptions}>
    <WorkerTab.Screen name="WorkerHome" options={{
      title: 'Inicio', tabBarIcon: tabIcon('home', 'home-outline'),
    }}>
      {() => <WorkerHomeNavigator verification={verification} onRefresh={onRefresh} />}
    </WorkerTab.Screen>
    <WorkerTab.Screen name="WorkerAgenda" options={{
      title: 'Agenda', tabBarIcon: tabIcon('calendar', 'calendar-outline'),
    }}>
      {() => <WorkerAgendaNavigator />}
    </WorkerTab.Screen>
    <WorkerTab.Screen name="WorkerRequests" options={{
      title: 'Solicitudes', tabBarIcon: tabIcon('document-text', 'document-text-outline'),
    }}>
      {() => <RequestsNavigator role="TRABAJADOR" />}
    </WorkerTab.Screen>
    <WorkerTab.Screen name="WorkerEarnings" options={{
      title: 'Ganancias', tabBarIcon: tabIcon('wallet', 'wallet-outline'),
    }}>
      {() => <ComingSoonScreen title="Ganancias" />}
    </WorkerTab.Screen>
    <WorkerTab.Screen name="WorkerProfile" component={ProfileScreen} options={{
      title: 'Perfil', tabBarIcon: tabIcon('person', 'person-outline'),
    }} />
  </WorkerTab.Navigator>;
}
