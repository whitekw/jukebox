import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { RoomPage } from './pages/room/RoomPage'

function LegacyHostRedirect() {
  const { code = '' } = useParams()
  return <Navigate to={`/room/${code}`} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/host/:code" element={<LegacyHostRedirect />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
