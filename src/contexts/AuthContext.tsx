'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, UserRole } from '@/types/database'

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => boolean
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const USERS: { username: string; password: string; role: UserRole }[] = [
  { username: 'Altuadmin', password: 'Altuadmin2025', role: 'owner' },
  { username: 'Altucashier', password: 'Altucashier', role: 'cashier' },
]

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for stored session
    const storedUser = localStorage.getItem('altugreal_user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('altugreal_user')
      }
    }
    setIsLoading(false)
  }, [])

  const login = (username: string, password: string): boolean => {
    const foundUser = USERS.find(
      (u) => u.username === username && u.password === password
    )
    
    if (foundUser) {
      const userObj: User = { username: foundUser.username, role: foundUser.role }
      setUser(userObj)
      localStorage.setItem('altugreal_user', JSON.stringify(userObj))
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('altugreal_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
