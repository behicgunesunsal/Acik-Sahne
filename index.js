import { registerRootComponent } from 'expo';
import App from './App';

// Default export for environments (e.g., Snack/web) expecting a module export
export default App;

// Register root for native environments (Expo Go / builds)
registerRootComponent(App);
