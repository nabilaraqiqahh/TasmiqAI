// URL polyfill must be first — required by Supabase JS on React Native web
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
