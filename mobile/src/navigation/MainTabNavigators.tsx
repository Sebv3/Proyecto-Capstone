import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import type { WorkerVerification } from '../api/workerVerification';
import { ClientHomeScreen } from '../screens/ClientHomeScreen';
import { ComingSoonScreen } from '../screens/ComingSoonScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkerHomeScreen } from '../screens/WorkerHomeScreen';

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
  ClientSearch: undefined;
  ClientMap: undefined;
  ClientRequests: undefined;
  ClientProfile: undefined;
};

const ClientTab = createBottomTabNavigator<ClientTabParamList>();

export function ClientMainTabs() {
  return <ClientTab.Navigator initialRouteName="ClientHome" screenOptions={commonScreenOptions}>
    <ClientTab.Screen name="ClientHome" options={{
      title: 'Inicio', tabBarIcon: tabIcon('home', 'home-outline'),
    }}>
      {({ navigation }) => <ClientHomeScreen onSearch={() => navigation.navigate('ClientSearch')} />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientSearch" options={{
      title: 'Buscar', tabBarIcon: tabIcon('search', 'search-outline'),
    }}>
      {() => <ComingSoonScreen title="Buscar" />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientMap" options={{
      title: 'Mapa', tabBarIcon: tabIcon('map', 'map-outline'),
    }}>
      {() => <ComingSoonScreen title="Mapa" />}
    </ClientTab.Screen>
    <ClientTab.Screen name="ClientRequests" options={{
      title: 'Solicitudes', tabBarIcon: tabIcon('list', 'list-outline'),
    }}>
      {() => <ComingSoonScreen title="Solicitudes" />}
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

export function WorkerMainTabs({
  verification, onRefresh,
}: { verification: WorkerVerification; onRefresh: () => void }) {
  return <WorkerTab.Navigator initialRouteName="WorkerHome" screenOptions={commonScreenOptions}>
    <WorkerTab.Screen name="WorkerHome" options={{
      title: 'Inicio', tabBarIcon: tabIcon('home', 'home-outline'),
    }}>
      {({ navigation }) => <WorkerHomeScreen verification={verification}
        onProfile={() => navigation.navigate('WorkerProfile')} onRefresh={onRefresh} />}
    </WorkerTab.Screen>
    <WorkerTab.Screen name="WorkerAgenda" options={{
      title: 'Agenda', tabBarIcon: tabIcon('calendar', 'calendar-outline'),
    }}>
      {() => <ComingSoonScreen title="Agenda" />}
    </WorkerTab.Screen>
    <WorkerTab.Screen name="WorkerRequests" options={{
      title: 'Solicitudes', tabBarIcon: tabIcon('document-text', 'document-text-outline'),
    }}>
      {() => <ComingSoonScreen title="Solicitudes" />}
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
