import axios from 'axios'

const WEATHER_BASE = import.meta.env.VITE_WEATHER_API_URL || 'https://api.openweathermap.org/data/2.5'
const API_KEY = import.meta.env.VITE_WEATHER_API_KEY

export interface WeatherData {
  name: string
  weather: { description: string; icon: string }[]
  main: { temp: number; feels_like: number; humidity: number }
  wind?: { speed: number }
}

export const weatherApi = {
  getByCity: async (city: string): Promise<WeatherData> => {
    if (!API_KEY) {
      throw new Error('Missing VITE_WEATHER_API_KEY in environment')
    }
    const params = { q: city, appid: API_KEY, units: 'metric', lang: 'vi' }
    const res = await axios.get(`${WEATHER_BASE}/weather`, { params })
    return res.data
  }
}
