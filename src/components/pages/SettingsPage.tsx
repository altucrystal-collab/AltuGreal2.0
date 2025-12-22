'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PaymentMethod, CustomerType } from '@/types/database'
import toast from 'react-hot-toast'

const COLOR_OPTIONS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
]

export default function SettingsPage() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [loading, setLoading] = useState(true)

  // Form states
  const [newPaymentMethod, setNewPaymentMethod] = useState({ name: '', color: '#3b82f6' })
  const [newCustomerType, setNewCustomerType] = useState({ name: '', color: '#22c55e' })
  const [isAddingPayment, setIsAddingPayment] = useState(false)
  const [isAddingCustomer, setIsAddingCustomer] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [paymentRes, customerRes] = await Promise.all([
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('customer_types').select('*').order('name'),
      ])

      if (paymentRes.data) setPaymentMethods(paymentRes.data)
      if (customerRes.data) setCustomerTypes(customerRes.data)
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const addPaymentMethod = async () => {
    if (!newPaymentMethod.name.trim()) {
      toast.error('Please enter a payment method name')
      return
    }

    setIsAddingPayment(true)
    try {
      const { error } = await (supabase as any).from('payment_methods').insert({
        name: newPaymentMethod.name.trim(),
        color: newPaymentMethod.color,
      })

      if (error) throw error
      toast.success('Payment method added')
      setNewPaymentMethod({ name: '', color: '#3b82f6' })
      fetchData()
    } catch (error) {
      console.error('Error adding payment method:', error)
      toast.error('Failed to add payment method')
    } finally {
      setIsAddingPayment(false)
    }
  }

  const deletePaymentMethod = async (id: string) => {
    if (!confirm('Delete this payment method?')) return

    try {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) throw error
      toast.success('Payment method deleted')
      fetchData()
    } catch (error) {
      console.error('Error deleting payment method:', error)
      toast.error('Failed to delete payment method')
    }
  }

  const addCustomerType = async () => {
    if (!newCustomerType.name.trim()) {
      toast.error('Please enter a customer type name')
      return
    }

    setIsAddingCustomer(true)
    try {
      const { error } = await (supabase as any).from('customer_types').insert({
        name: newCustomerType.name.trim(),
        color: newCustomerType.color,
      })

      if (error) throw error
      toast.success('Customer type added')
      setNewCustomerType({ name: '', color: '#22c55e' })
      fetchData()
    } catch (error) {
      console.error('Error adding customer type:', error)
      toast.error('Failed to add customer type')
    } finally {
      setIsAddingCustomer(false)
    }
  }

  const deleteCustomerType = async (id: string) => {
    if (!confirm('Delete this customer type?')) return

    try {
      const { error } = await supabase.from('customer_types').delete().eq('id', id)
      if (error) throw error
      toast.success('Customer type deleted')
      fetchData()
    } catch (error) {
      console.error('Error deleting customer type:', error)
      toast.error('Failed to delete customer type')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-surface-400 text-sm mt-1">Configure your POS system</p>
      </div>

      {/* Payment Methods */}
      <div className="card p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Payment Methods</h3>
        <p className="text-surface-400 text-sm mb-4">
          Add payment methods like Cash, Card, E-Wallet, etc.
        </p>

        {/* Existing Payment Methods */}
        <div className="flex flex-wrap gap-2 mb-4">
          {paymentMethods.length === 0 ? (
            <p className="text-surface-500 text-sm">No payment methods configured yet</p>
          ) : (
            paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg group"
                style={{ backgroundColor: pm.color }}
              >
                <span className="text-white font-medium">{pm.name}</span>
                <button
                  onClick={() => deletePaymentMethod(pm.id)}
                  className="text-white/50 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add New Payment Method */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newPaymentMethod.name}
            onChange={(e) => setNewPaymentMethod((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Payment method name"
            className="flex-1 px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
          />
          <div className="flex gap-2">
            <div className="relative">
              <input
                type="color"
                value={newPaymentMethod.color}
                onChange={(e) => setNewPaymentMethod((prev) => ({ ...prev, color: e.target.value }))}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div
                className="w-10 h-10 rounded-lg border-2 border-surface-700 cursor-pointer"
                style={{ backgroundColor: newPaymentMethod.color }}
              />
            </div>
            <button
              onClick={addPaymentMethod}
              disabled={isAddingPayment}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Color Presets */}
        <div className="mt-3">
          <p className="text-xs text-surface-500 mb-2">Quick colors:</p>
          <div className="flex flex-wrap gap-1">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                onClick={() => setNewPaymentMethod((prev) => ({ ...prev, color: color.value }))}
                className={`w-6 h-6 rounded-md transition-transform hover:scale-110 ${
                  newPaymentMethod.color === color.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141416]' : ''
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Customer Types */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Customer Types</h3>
        <p className="text-surface-400 text-sm mb-4">
          Add customer types like Student, Nurse, Driver, etc.
        </p>

        {/* Existing Customer Types */}
        <div className="flex flex-wrap gap-2 mb-4">
          {customerTypes.length === 0 ? (
            <p className="text-surface-500 text-sm">No customer types configured yet</p>
          ) : (
            customerTypes.map((ct) => (
              <div
                key={ct.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg group"
                style={{ backgroundColor: ct.color }}
              >
                <span className="text-white font-medium">{ct.name}</span>
                <button
                  onClick={() => deleteCustomerType(ct.id)}
                  className="text-white/50 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add New Customer Type */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newCustomerType.name}
            onChange={(e) => setNewCustomerType((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Customer type name"
            className="flex-1 px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
          />
          <div className="flex gap-2">
            <div className="relative">
              <input
                type="color"
                value={newCustomerType.color}
                onChange={(e) => setNewCustomerType((prev) => ({ ...prev, color: e.target.value }))}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div
                className="w-10 h-10 rounded-lg border-2 border-surface-700 cursor-pointer"
                style={{ backgroundColor: newCustomerType.color }}
              />
            </div>
            <button
              onClick={addCustomerType}
              disabled={isAddingCustomer}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Color Presets */}
        <div className="mt-3">
          <p className="text-xs text-surface-500 mb-2">Quick colors:</p>
          <div className="flex flex-wrap gap-1">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                onClick={() => setNewCustomerType((prev) => ({ ...prev, color: color.value }))}
                className={`w-6 h-6 rounded-md transition-transform hover:scale-110 ${
                  newCustomerType.color === color.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141416]' : ''
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}


