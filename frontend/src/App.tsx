import { useAuthStore } from './store/authStore'
import { AuthForm } from './components/AuthForm'
import { Dashboard } from './components/Dashboard'

function App() {
  const token = useAuthStore((state) => state.token)

  return token ? <Dashboard /> : <AuthForm />
}

export default App