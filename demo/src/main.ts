import '@1337exp/taoui/styles.css';
import 'prosemirror-view/style/prosemirror.css';
import '@1337exp/taoeditor/content.css';
import '@1337exp/taoeditor/editor.css';
import '@1337exp/taoeditor/taoui.css'; // the bridge: the editor follows the TaoUI theme
import { createApp } from 'vue';
import App from './App.vue';
import { initI18n } from './i18n';
import './styles.css';
import { initTheme } from './theme';

initI18n();
initTheme();

createApp(App).mount('#app');
