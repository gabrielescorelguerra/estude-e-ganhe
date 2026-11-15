import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.estudeeganhe',
  appName: 'Estude e Ganhe',
  webDir: 'dist',
  backgroundColor: '#F3F0E8',
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#E3A008' },
  },
};
export default config;
