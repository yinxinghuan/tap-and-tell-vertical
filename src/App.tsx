import TapAndTell from './TapAndTell/TapAndTell';
import Demo from './TapAndTell/Demo';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === 'all') return <Demo />;
  return <TapAndTell />;
}
