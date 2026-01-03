'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Sale, PaymentMethod, CustomerType } from '@/types/database'
import { format, startOfDay, endOfDay, subDays } from 'date-fns'
import toast from 'react-hot-toast'

interface SaleWithEarnings extends Omit<Sale, 'earnings_datetime'> {
  earnings_datetime: string | null
  transaction_number: string | null
}

interface Transaction {
  id: string
  transaction_number: string
  items: SaleWithEarnings[]
  total: number
  cost: number
  payment_method: string
  customer_type: string
  dine_in_takeout: 'dine_in' | 'takeout'
  created_at: string
  earnings_datetime: string
  customer_payment: number | null
}

interface OpexItem {
  monthly_cost: number
}

export default function ReportsPage() {
  const [sales, setSales] = useState<SaleWithEarnings[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [loading, setLoading] = useState(true)
  
  // OPEX data
  const [totalMonthlyOpex, setTotalMonthlyOpex] = useState(0)
  
  // Date range
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  
  // Selection
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set())
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  
  // Editing
  const [editingField, setEditingField] = useState<string | null>(null)

  // Fetch OPEX data
  const fetchOpexData = useCallback(async () => {
    try {
      const { data } = await supabase.from('opex').select('monthly_cost')
      const total = (data || []).reduce((sum: number, item: OpexItem) => sum + item.monthly_cost, 0)
      setTotalMonthlyOpex(total)
    } catch (error) {
      console.error('Error fetching OPEX:', error)
    }
  }, [])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const dateStart = startOfDay(new Date(startDate))
      const dateEnd = endOfDay(new Date(endDate))

      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('cancelled', false)
        .gte('created_at', dateStart.toISOString())
        .lte('created_at', dateEnd.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Normalize field names for backward compatibility
      const normalizedSales: SaleWithEarnings[] = (data || []).map((sale: any) => ({
        ...sale,
        earnings_datetime: sale.earnings_datetime || sale.store_sale_datetime || sale.created_at,
        transaction_id: sale.transaction_id || sale.id,
        transaction_number: sale.transaction_number || null
      }))
      
      setSales(normalizedSales)

      // Group into transactions
      const grouped = normalizedSales.reduce((acc, sale) => {
        const txId = sale.transaction_id || sale.id
        if (!acc[txId]) {
          acc[txId] = {
            id: txId,
            transaction_number: sale.transaction_number || txId.substring(0, 8),
            items: [],
            total: 0,
            cost: 0,
            payment_method: sale.payment_method,
            customer_type: sale.customer_type,
            dine_in_takeout: sale.dine_in_takeout,
            created_at: sale.created_at,
            earnings_datetime: sale.earnings_datetime || sale.created_at,
            customer_payment: sale.customer_payment
          }
        }
        acc[txId].items.push(sale)
        acc[txId].total += sale.total
        acc[txId].cost += (sale.cost * sale.qty)
        return acc
      }, {} as Record<string, Transaction>)

      // Sort by created_at descending
      const sortedTransactions = Object.values(grouped).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      setTransactions(sortedTransactions)
    } catch (error) {
      console.error('Error fetching sales:', error)
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const fetchOptions = useCallback(async () => {
    const [paymentRes, customerRes] = await Promise.all([
      supabase.from('payment_methods').select('*'),
      supabase.from('customer_types').select('*'),
    ])
    if (paymentRes.data) setPaymentMethods(paymentRes.data)
    if (customerRes.data) setCustomerTypes(customerRes.data)
  }, [])

  useEffect(() => {
    fetchSales()
    fetchOptions()
    fetchOpexData()
  }, [fetchSales, fetchOptions, fetchOpexData])

  const toggleSelectTransaction = (txId: string) => {
    setSelectedTransactions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(txId)) {
        newSet.delete(txId)
      } else {
        newSet.add(txId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set())
    } else {
      setSelectedTransactions(new Set(transactions.map((t) => t.id)))
    }
  }

  const handleArchive = async () => {
    if (selectedTransactions.size === 0) return

    try {
      // Get selected transactions
      const selectedTxs = transactions.filter((t) => selectedTransactions.has(t.id))
      
      // Get all sale IDs for selected transactions
      const salesToArchive = sales.filter((s) => selectedTransactions.has(s.transaction_id || s.id))

      // Generate CSV with exactly what's shown in the report
      const csvHeaders = [
        'Transaction #',
        'Items',
        'Payment',
        'Customer',
        'Order',
        'Timestamp',
        'Report Date',
        'Total',
        'Remaining OPEX',
        'Net Profit'
      ]
      
      // Calculate running totals for OPEX and profit (same logic as table)
      const sortedForCalc = [...selectedTxs].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      
      let runningGrossMargin = 0
      const txCalculations = new Map<string, { remainingOpex: number, netProfit: number }>()
      
      for (const tx of sortedForCalc) {
        const grossMargin = tx.total - tx.cost
        runningGrossMargin += grossMargin
        
        const remainingOpex = Math.max(0, totalMonthlyOpex - runningGrossMargin)
        const netProfit = runningGrossMargin > totalMonthlyOpex 
          ? runningGrossMargin - totalMonthlyOpex 
          : 0
        
        txCalculations.set(tx.id, { remainingOpex, netProfit })
      }
      
      const csvRows = selectedTxs.map((tx) => {
        const itemsList = tx.items.map(i => `${i.product_name} (${i.qty}pcs)`).join('; ')
        const calc = txCalculations.get(tx.id) || { remainingOpex: totalMonthlyOpex, netProfit: 0 }
        
        return [
          tx.transaction_number,
          `"${itemsList}"`,
          tx.payment_method,
          tx.customer_type,
          tx.dine_in_takeout === 'dine_in' ? 'Dine In' : 'Takeout',
          format(new Date(tx.created_at), 'MMM d yyyy h:mm a'),
          format(new Date(tx.earnings_datetime), 'MMM d yyyy h:mm a'),
          tx.total.toFixed(2),
          calc.remainingOpex.toFixed(2),
          calc.netProfit.toFixed(2),
        ]
      })

      const csvContent = [csvHeaders.join(','), ...csvRows.map((row) => row.join(','))].join('\n')

      // Download CSV with current date as filename
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sales-archive-${format(new Date(), 'yyyy-MM-dd')}.csv`
      a.click()
      window.URL.revokeObjectURL(url)

      // Delete from database
      const { error } = await supabase
        .from('sales')
        .delete()
        .in('id', salesToArchive.map(s => s.id))

      if (error) throw error

      toast.success('Reports archived and downloaded')
      setSelectedTransactions(new Set())
      setShowArchiveModal(false)
      fetchSales()
    } catch (error) {
      console.error('Error archiving sales:', error)
      toast.error('Failed to archive sales')
    }
  }

  const handleUpdateTransaction = async (txId: string, field: string, value: string) => {
    try {
      const { error } = await (supabase as any)
        .from('sales')
        .update({ [field]: value })
        .eq('transaction_id', txId)

      if (error) throw error

      // Update local state
      setSales(prev => prev.map(s => 
        (s.transaction_id || s.id) === txId ? { ...s, [field]: value } : s
      ))
      
      setTransactions(prev => prev.map(t => 
        t.id === txId ? { ...t, [field]: value } : t
      ))
      
      toast.success('Updated successfully')
      setEditingField(null)
    } catch (error) {
      console.error('Error updating:', error)
      toast.error('Failed to update')
    }
  }

  const handleUpdateEarningsDateTime = async (txId: string, newDateTime: string) => {
    try {
      const isoDateTime = new Date(newDateTime).toISOString()
      
      // Try new column name first, fall back to old
      let result = await (supabase as any)
        .from('sales')
        .update({ earnings_datetime: isoDateTime })
        .eq('transaction_id', txId)
      
      // If new column doesn't exist, try old column name
      if (result.error && result.error.message.includes('earnings_datetime')) {
        result = await (supabase as any)
          .from('sales')
          .update({ store_sale_datetime: isoDateTime })
          .eq('transaction_id', txId)
      }

      if (result.error) throw result.error

      setSales(prev => prev.map(s => 
        (s.transaction_id || s.id) === txId 
          ? { ...s, earnings_datetime: isoDateTime } 
          : s
      ))
      
      setTransactions(prev => prev.map(t => 
        t.id === txId ? { ...t, earnings_datetime: isoDateTime } : t
      ))
      
      toast.success('Report Date updated')
      setEditingField(null)
    } catch (error) {
      console.error('Error updating report date:', error)
      toast.error('Failed to update')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totalSales = transactions.reduce((sum, t) => sum + t.total, 0)

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-surface-400 text-sm mt-1">View and manage sales records</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range */}
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
          
          {selectedTransactions.size > 0 && (
            <button
              onClick={() => setShowArchiveModal(true)}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archive ({selectedTransactions.size})
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-blue-400 text-sm">
          💡 <strong>Timestamp</strong> is immutable (actual purchase time). 
          <strong> Report Date</strong> can be edited and is used for earnings calculations.
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No sales in this date range</h3>
          <p className="text-surface-400 text-sm">Try selecting a different date range</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Select All */}
          <div className="flex items-center gap-2 px-2">
            <input
              type="checkbox"
              checked={selectedTransactions.size === transactions.length && transactions.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-surface-400 text-sm">Select All ({transactions.length} transactions)</span>
          </div>

          {/* Transactions Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-800 bg-surface-800/50">
                    <th className="p-4 text-left w-12"></th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">Transaction #</th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">Items</th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">Payment</th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">Customer</th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">Order</th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">
                      <span className="text-surface-500">Timestamp</span>
                    </th>
                    <th className="p-4 text-left text-sm font-medium text-surface-400">
                      <span className="text-primary-400">Report Date</span>
                    </th>
                    <th className="p-4 text-right text-sm font-medium text-surface-400">Total</th>
                    <th className="p-4 text-right text-sm font-medium text-yellow-400">Remaining OPEX</th>
                    <th className="p-4 text-right text-sm font-medium text-green-400">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Calculate running totals for OPEX and profit
                    // Sort transactions by date ascending for correct running calculation
                    const sortedForCalc = [...transactions].sort((a, b) => 
                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    )
                    
                    let runningGrossMargin = 0
                    const txCalculations = new Map<string, { remainingOpex: number, netProfit: number }>()
                    
                    for (const tx of sortedForCalc) {
                      const grossMargin = tx.total - tx.cost
                      runningGrossMargin += grossMargin
                      
                      const remainingOpex = Math.max(0, totalMonthlyOpex - runningGrossMargin)
                      const netProfit = runningGrossMargin > totalMonthlyOpex 
                        ? runningGrossMargin - totalMonthlyOpex 
                        : 0
                      
                      txCalculations.set(tx.id, { remainingOpex, netProfit })
                    }
                    
                    return transactions.map((tx) => {
                      const calc = txCalculations.get(tx.id) || { remainingOpex: totalMonthlyOpex, netProfit: 0 }
                      return (
                    <tr key={tx.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedTransactions.has(tx.id)}
                          onChange={() => toggleSelectTransaction(tx.id)}
                          className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                        />
                      </td>
                      <td className="p-4">
                        <span className="text-white font-mono text-sm">{tx.transaction_number}</span>
                      </td>
                      <td className="p-4">
                        <div className="max-w-xs">
                          <span className="text-white text-sm">
                            {tx.items.map(i => `${i.product_name} (${i.qty}pcs)`).join(', ')}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        {editingField === `${tx.id}-payment` ? (
                          <select
                            value={tx.payment_method}
                            onChange={(e) => handleUpdateTransaction(tx.id, 'payment_method', e.target.value)}
                            onBlur={() => setEditingField(null)}
                            autoFocus
                            className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                          >
                            {paymentMethods.map((pm) => (
                              <option key={pm.id} value={pm.name}>{pm.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingField(`${tx.id}-payment`)}
                            className="text-surface-300 hover:text-white text-sm"
                          >
                            {tx.payment_method}
                          </button>
                        )}
                      </td>
                      <td className="p-4">
                        {editingField === `${tx.id}-customer` ? (
                          <select
                            value={tx.customer_type}
                            onChange={(e) => handleUpdateTransaction(tx.id, 'customer_type', e.target.value)}
                            onBlur={() => setEditingField(null)}
                            autoFocus
                            className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                          >
                            {customerTypes.map((ct) => (
                              <option key={ct.id} value={ct.name}>{ct.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingField(`${tx.id}-customer`)}
                            className="text-surface-300 hover:text-white text-sm"
                          >
                            {tx.customer_type}
                          </button>
                        )}
                      </td>
                      <td className="p-4">
                        {editingField === `${tx.id}-order` ? (
                          <select
                            value={tx.dine_in_takeout}
                            onChange={(e) => handleUpdateTransaction(tx.id, 'dine_in_takeout', e.target.value)}
                            onBlur={() => setEditingField(null)}
                            autoFocus
                            className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                          >
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                          </select>
                        ) : (
                          <button
                            onClick={() => setEditingField(`${tx.id}-order`)}
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              tx.dine_in_takeout === 'dine_in' 
                                ? 'bg-blue-500/20 text-blue-400' 
                                : 'bg-green-500/20 text-green-400'
                            }`}
                          >
                            {tx.dine_in_takeout === 'dine_in' ? 'Dine In' : 'Takeout'}
                          </button>
                        )}
                      </td>
                      <td className="p-4 text-surface-500 text-sm font-mono">
                        {format(new Date(tx.created_at), 'MMM d yyyy h:mm a')}
                      </td>
                      <td className="p-4">
                        {editingField === `${tx.id}-earnings` ? (
                          <input
                            type="datetime-local"
                            defaultValue={format(new Date(tx.earnings_datetime), "yyyy-MM-dd'T'HH:mm")}
                            onChange={(e) => handleUpdateEarningsDateTime(tx.id, e.target.value)}
                            onBlur={() => setEditingField(null)}
                            autoFocus
                            className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingField(`${tx.id}-earnings`)}
                            className="text-primary-400 hover:text-primary-300 text-sm font-mono"
                          >
                            {format(new Date(tx.earnings_datetime), 'MMM d yyyy h:mm a')}
                          </button>
                        )}
                      </td>
                      <td className="p-4 text-right text-primary-500 font-bold font-mono">
                        ₱{tx.total.toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-mono text-sm">
                        <span className={calc.remainingOpex > 0 ? 'text-yellow-400' : 'text-green-400'}>
                          ₱{calc.remainingOpex.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-sm">
                        <span className={calc.netProfit > 0 ? 'text-green-400' : 'text-surface-500'}>
                          ₱{calc.netProfit.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total Summary */}
          <div className="card p-4 bg-primary-500/10 border border-primary-500/20">
            <div className="flex items-center justify-between">
              <span className="text-surface-400 font-medium text-lg">
                Total Sales ({startDate === endDate ? format(new Date(startDate), 'MMM d, yyyy') : `${format(new Date(startDate), 'MMM d')} - ${format(new Date(endDate), 'MMM d, yyyy')}`})
              </span>
              <span className="text-primary-500 font-bold text-xl font-mono">
                ₱{totalSales.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Archive Selected Reports?</h3>
            <p className="text-surface-400 text-sm mb-4">
              This will download a CSV file and <strong className="text-red-400">permanently delete</strong> the selected {selectedTransactions.size} transaction(s) from the database.
            </p>
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
              <p className="text-yellow-400 text-sm">
                ⚠️ This action cannot be undone. Make sure to keep the downloaded CSV as your backup.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowArchiveModal(false)}
                className="flex-1 px-4 py-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
              >
                Download & Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
