'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Sale } from '@/types/database'
import { format, startOfDay, endOfDay, subDays, eachDayOfInterval, parseISO } from 'date-fns'

interface ExtendedSale extends Sale {
  store_sale_datetime?: string
}
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
} from 'chart.js'
import { Pie, Line } from 'react-chartjs-2'
import toast from 'react-hot-toast'

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler
)

const CHART_COLORS = [
  '#10b981',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
]

export default function EarningsPage() {
  const [sales, setSales] = useState<ExtendedSale[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'today' | 'range'>('today')
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))

  const fetchSales = useCallback(async () => {
    try {
      // Fetch all sales first, then filter by store_sale_datetime in JS
      // This is because Supabase might not have the column yet
      const { data, error } = await (supabase as any)
        .from('sales')
        .select('*')
        .eq('cancelled', false)
        .order('created_at', { ascending: true })

      if (error) throw error

      // Add store_sale_datetime fallback and filter by it
      const salesWithStoreDateTime = (data || []).map((sale: any) => ({
        ...sale,
        store_sale_datetime: sale.store_sale_datetime || sale.created_at
      }))

      let filteredSales = salesWithStoreDateTime

      if (viewMode === 'today') {
        const today = new Date()
        const dateStart = startOfDay(today)
        const dateEnd = endOfDay(today)
        filteredSales = salesWithStoreDateTime.filter((s: ExtendedSale) => {
          const saleDate = new Date(s.store_sale_datetime || s.created_at)
          return saleDate >= dateStart && saleDate <= dateEnd
        })
      } else {
        const dateStart = startOfDay(new Date(startDate))
        const dateEnd = endOfDay(new Date(endDate))
        filteredSales = salesWithStoreDateTime.filter((s: ExtendedSale) => {
          const saleDate = new Date(s.store_sale_datetime || s.created_at)
          return saleDate >= dateStart && saleDate <= dateEnd
        })
      }

      setSales(filteredSales)
    } catch (error) {
      console.error('Error fetching sales:', error)
      toast.error('Failed to load earnings data')
    } finally {
      setLoading(false)
    }
  }, [viewMode, startDate, endDate])

  useEffect(() => {
    fetchSales()
    
    // Auto-refresh every 30 seconds for live data when viewing today
    let interval: NodeJS.Timeout | null = null
    if (viewMode === 'today') {
      interval = setInterval(fetchSales, 30000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [fetchSales, viewMode])

  // Calculate totals
  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0)
  const totalCost = sales.reduce((sum, s) => sum + (s.cost * s.qty), 0)
  const totalProfit = totalRevenue - totalCost

  // Customer type data for pie chart
  const customerTypeData = sales.reduce((acc, sale) => {
    acc[sale.customer_type] = (acc[sale.customer_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Payment method data for pie chart
  const paymentMethodData = sales.reduce((acc, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Dine in / Takeout data
  const dineInTakeoutData = sales.reduce((acc, sale) => {
    const type = sale.dine_in_takeout || 'N/A'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Line chart data for date range - uses store_sale_datetime for earnings tracking
  const getLineChartData = () => {
    if (viewMode !== 'range') return null

    const days = eachDayOfInterval({
      start: parseISO(startDate),
      end: parseISO(endDate),
    })

    const revenueByDay = days.map((day) => {
      const dayStr = format(day, 'yyyy-MM-dd')
      return sales
        .filter((s) => format(new Date(s.store_sale_datetime || s.created_at), 'yyyy-MM-dd') === dayStr)
        .reduce((sum, s) => sum + s.total, 0)
    })

    const profitByDay = days.map((day) => {
      const dayStr = format(day, 'yyyy-MM-dd')
      const daySales = sales.filter((s) => format(new Date(s.store_sale_datetime || s.created_at), 'yyyy-MM-dd') === dayStr)
      const revenue = daySales.reduce((sum, s) => sum + s.total, 0)
      const cost = daySales.reduce((sum, s) => sum + (s.cost * s.qty), 0)
      return revenue - cost
    })

    return {
      labels: days.map((d) => format(d, 'MMM d')),
      datasets: [
        {
          label: 'Revenue',
          data: revenueByDay,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Profit',
          data: profitByDay,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    }
  }

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94a3b8',
          padding: 16,
          font: {
            size: 12,
          },
        },
      },
    },
  }

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#94a3b8',
          padding: 16,
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(39, 39, 42, 0.5)',
        },
        ticks: {
          color: '#94a3b8',
        },
      },
      y: {
        grid: {
          color: 'rgba(39, 39, 42, 0.5)',
        },
        ticks: {
          color: '#94a3b8',
          callback: (value: number | string) => `₱${value}`,
        },
      },
    },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Earnings</h1>
          <p className="text-surface-400 text-sm mt-1">
            {viewMode === 'today' ? "Today's live earnings" : 'Date range analysis'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-surface-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('today')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewMode === 'today'
                  ? 'bg-primary-500 text-white'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setViewMode('range')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewMode === 'range'
                  ? 'bg-primary-500 text-white'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              Range
            </button>
          </div>

          {viewMode === 'range' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm"
              />
              <span className="text-surface-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Today's note */}
      {viewMode === 'today' && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-green-400 text-sm">
            📊 Showing today&apos;s live data based on <strong>Store Sale DateTime</strong>. Auto-refreshes every 30 seconds.
          </p>
        </div>
      )}

      {/* Range note */}
      {viewMode === 'range' && (
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-400 text-sm">
            💡 Earnings are calculated based on <strong>Store Sale DateTime</strong> which can be edited in Reports.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-surface-400 text-sm">Total Revenue</p>
              <p className="text-2xl font-bold text-white font-mono">₱{totalRevenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </div>
            <div>
              <p className="text-surface-400 text-sm">Total Cost</p>
              <p className="text-2xl font-bold text-white font-mono">₱{totalCost.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <svg className={`w-5 h-5 ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={totalProfit >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
              </svg>
            </div>
            <div>
              <p className="text-surface-400 text-sm">Net Profit</p>
              <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ₱{totalProfit.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {sales.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No sales data available</h3>
          <p className="text-surface-400 text-sm">Try selecting a different date range</p>
        </div>
      ) : (
        <>
          {/* Line Chart for Range View */}
          {viewMode === 'range' && getLineChartData() && (
            <div className="card p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Revenue & Profit Trend</h3>
              <div className="h-80">
                <Line data={getLineChartData()!} options={lineOptions} />
              </div>
            </div>
          )}

          {/* Pie Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Customer Type Pie */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Customer Types</h3>
              {Object.keys(customerTypeData).length > 0 ? (
                <div className="aspect-square">
                  <Pie
                    data={{
                      labels: Object.keys(customerTypeData),
                      datasets: [
                        {
                          data: Object.values(customerTypeData),
                          backgroundColor: CHART_COLORS,
                          borderWidth: 0,
                        },
                      ],
                    }}
                    options={pieOptions}
                  />
                </div>
              ) : (
                <p className="text-surface-500 text-center py-8">No data</p>
              )}
            </div>

            {/* Payment Method Pie */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Payment Methods</h3>
              {Object.keys(paymentMethodData).length > 0 ? (
                <div className="aspect-square">
                  <Pie
                    data={{
                      labels: Object.keys(paymentMethodData),
                      datasets: [
                        {
                          data: Object.values(paymentMethodData),
                          backgroundColor: CHART_COLORS,
                          borderWidth: 0,
                        },
                      ],
                    }}
                    options={pieOptions}
                  />
                </div>
              ) : (
                <p className="text-surface-500 text-center py-8">No data</p>
              )}
            </div>

            {/* Dine In / Takeout Pie */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Dine In / Takeout</h3>
              {Object.keys(dineInTakeoutData).length > 0 ? (
                <div className="aspect-square">
                  <Pie
                    data={{
                      labels: Object.keys(dineInTakeoutData).map((k) =>
                        k === 'dine_in' ? 'Dine In' : k === 'takeout' ? 'Takeout' : 'N/A'
                      ),
                      datasets: [
                        {
                          data: Object.values(dineInTakeoutData),
                          backgroundColor: ['#3b82f6', '#22c55e', '#6b7280'],
                          borderWidth: 0,
                        },
                      ],
                    }}
                    options={pieOptions}
                  />
                </div>
              ) : (
                <p className="text-surface-500 text-center py-8">No data</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


