import { useState, FormEvent } from 'react'
import { weatherApi } from '../../services/weather'

export default function WeatherPage() {
  const [city, setCity] = useState('')
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!city.trim()) {
      setError('Nhập tên thành phố')
      return
    }
    setLoading(true)
    setError('')
    setData(null)
    try {
      const res = await weatherApi.getByCity(city.trim())
      setData(res)
    } catch (err: any) {
      console.error(err)
      setError(err?.response?.data?.message || err?.message || 'Lỗi khi lấy dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text">Thời tiết</h1>

      <form onSubmit={search} className="flex gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Nhập thành phố, ví dụ: Hà Nội"
          className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-dark-text"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white disabled:opacity-60"
        >
          {loading ? '...' : 'Tìm'}
        </button>
      </form>

      {error && <div className="text-red-500">{error}</div>}

      {data && (
        <div className="bg-white dark:bg-dark-card rounded-lg p-4 border border-gray-100 dark:border-dark-border">
          <div className="flex items-center gap-4">
            <div className="text-3xl">
              {data.weather?.[0]?.icon ? (
                <img
                  src={`https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`}
                  alt={data.weather[0].description}
                />
              ) : (
                '⛅️'
              )}
            </div>
            <div>
              <div className="text-lg font-semibold">{data.name}</div>
              <div className="text-2xl font-bold">{Math.round(data.main.temp)}°C</div>
              <div className="text-sm text-gray-500 dark:text-dark-muted">{data.weather?.[0]?.description}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-gray-600 dark:text-dark-muted">
            <div>Feels: {Math.round(data.main.feels_like)}°C</div>
            <div>Humidity: {data.main.humidity}%</div>
            <div>Wind: {data.wind?.speed ?? 0} m/s</div>
          </div>
        </div>
      )}
    </div>
  )
}
