import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const items = [
  { to: '/feed', icon: '📰', label: 'Bảng tin' },
  { to: '/explore', icon: '🔍', label: 'Khám phá' },
  { to: '/search', icon: '🔎', label: 'Tìm kiếm' },
  { to: '/notifications', icon: '🔔', label: 'Thông báo' },
]

export default function BottomNav() {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-white dark:bg-dark-card border-t border-gray-200 dark:border-dark-border z-40">
      <div className="flex items-center justify-around py-1.5">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                isActive
                  ? 'text-blue-500'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-dark-muted'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}

        {user && (
          <NavLink
            to={`/profile/${user.id}`}
            className={({ isActive: _isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                location.pathname.startsWith('/profile') && location.pathname.includes(String(user.id))
                  ? 'text-blue-500'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-dark-muted'
              }`
            }
          >
            <span className="text-xl">👤</span>
            <span className="text-[10px] font-medium">Cá nhân</span>
          </NavLink>
        )}
      </div>
    </nav>
  )
}