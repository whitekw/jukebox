import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom'
import { HomePage } from '../features/home/HomePage'
import { CreateRoomPage } from '../features/room/pages/CreateRoomPage'
import { RoomPage } from '../features/room/pages/RoomPage'
import { AuthNotice } from '../features/auth/components/AuthNotice'

function LegacyHostRedirect() {
  const { code = '' } = useParams()
  return <Navigate to={`/room/${code}`} replace />
}

function RoomRoute() {
  const { code = '' } = useParams()
  return <RoomPage key={code} />
}

function App() {
  return (
    <BrowserRouter>
      <AuthNotice />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rooms/new" element={<CreateRoomPage />} />
        <Route path="/host/:code" element={<LegacyHostRedirect />} />
        <Route path="/room/:code" element={<RoomRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
