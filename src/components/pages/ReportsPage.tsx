'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Sale, PaymentMethod, CustomerType } from '@/types/database'
import { format, startOfDay, endOfDay } from 'date-fns'
import toast from 'react-hot-toast'

interface ExtendedSale extends Sale {
  store_sale_datetime?: string
  transaction_id?: string
}

export default function ReportsPage() {
  const [sales, setSales] = useState<ExtendedSale[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set())
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [editingSale, setEditingSale] = useState<string | null>(null)

  const fetchSales = useCallback(async () => {
    try {
      const dateStart = startOfDay(new Date(selectedDate))
      const dateEnd = endOfDay(new Date(selectedDate))

      // Try to fetch with store_sale_datetime, fall back to created_at if column doesn't exist
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('cancelled', false)
        .gte('created_at', dateStart.toISOString())
        .lte('created_at', dateEnd.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Ensure store_sale_datetime and transaction_id exist (fallback to created_at and id if not)
      const salesWithStoreDateTime = (data || []).map(sale => ({
        ...sale,
        store_sale_datetime: sale.store_sale_datetime || sale.created_at,
        transaction_id: sale.transaction_id || sale.id // Use id as transaction_id for backward compatibility
      }))
      
      setSales(salesWithStoreDateTime)
    } catch (error) {
      console.error('Error fetching sales:', error)
      toast.error('Failed to load sales')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

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
  }, [fetchSales, fetchOptions])

  const toggleSelectSale = (saleId: string) => {
    setSelectedSales((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(saleId)) {
        newSet.delete(saleId)
      } else {
        newSet.add(saleId)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedSales.size === sales.length) {
      setSelectedSales(new Set())
    } else {
      setSelectedSales(new Set(sales.map((s) => s.id)))
    }
  }

  const handleArchive = async () => {
    if (selectedSales.size === 0) return

    try {
      // Get selected sales data for CSV
      const salesToArchive = sales.filter((s) => selectedSales.has(s.id))

      // Generate CSV with transaction grouping
      const csvHeaders = ['Transaction ID', 'Item Name', 'Payment Method', 'Customer Type', 'Dine In/Takeout', 'System DateTime', 'Store DateTime', 'Quantity', 'Total']
      const csvRows = salesToArchive.map((s) => [
        (s as ExtendedSale).transaction_id || s.id,
        s.product_name,
        s.payment_method,
        s.customer_type,
        s.dine_in_takeout || 'N/A',
        format(new Date(s.created_at), 'yyyy-MM-dd HH:mm:ss'),
        format(new Date((s as ExtendedSale).store_sale_datetime || s.created_at), 'yyyy-MM-dd HH:mm:ss'),
        s.qty,
        s.total.toFixed(2),
      ])

      const csvContent = [csvHeaders.join(','), ...csvRows.map((row) => row.join(','))].join('\n')

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sales-report-${selectedDate}.csv`
      a.click()
      window.URL.revokeObjectURL(url)

      // Delete from database
      const { error } = await supabase
        .from('sales')
        .delete()
        .in('id', Array.from(selectedSales))

      if (error) throw error

      toast.success('Reports archived and downloaded')
      setSelectedSales(new Set())
      setShowArchiveModal(false)
      fetchSales()
    } catch (error) {
      console.error('Error archiving sales:', error)
      toast.error('Failed to archive sales')
    }
  }

  const handleUpdateSale = async (saleId: string, field: string, value: string) => {
    try {
      const { error } = await (supabase as any)
        .from('sales')
        .update({ [field]: value })
        .eq('id', saleId)

      if (error) throw error

      setSales((prev) =>
        prev.map((s) => (s.id === saleId ? { ...s, [field]: value } : s))
      )
      toast.success('Updated successfully')
      setEditingSale(null)
    } catch (error) {
      console.error('Error updating sale:', error)
      toast.error('Failed to update')
    }
  }

  const handleUpdateStoreDateTime = async (saleId: string, newDateTime: string) => {
    try {
      // Update all sales in the same transaction
      const sale = sales.find(s => s.id === saleId)
      if (sale && (sale as ExtendedSale).transaction_id) {
        const transactionId = (sale as ExtendedSale).transaction_id
        const { error } = await (supabase as any)
          .from('sales')
          .update({ store_sale_datetime: new Date(newDateTime).toISOString() })
          .eq('transaction_id', transactionId)

        if (error) throw error

        setSales((prev) =>
          prev.map((s) => 
            (s as ExtendedSale).transaction_id === transactionId 
              ? { ...s, store_sale_datetime: new Date(newDateTime).toISOString() } 
              : s
          )
        )
        toast.success('Store DateTime updated for entire transaction')
      } else {
        // Fallback for single sale update
        const { error } = await (supabase as any)
          .from('sales')
          .update({ store_sale_datetime: new Date(newDateTime).toISOString() })
          .eq('id', saleId)

        if (error) throw error

        setSales((prev) =>
          prev.map((s) => (s.id === saleId ? { ...s, store_sale_datetime: new Date(newDateTime).toISOString() } : s))
        )
        toast.success('Store DateTime updated')
      }
      setEditingSale(null)
    } catch (error) {
      console.error('Error updating store datetime:', error)
      toast.error('Failed to update. Make sure to run the database schema update.')
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
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-surface-400 text-sm mt-1">View and manage sales records</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
          />
          {selectedSales.size > 0 && (
            <button
              onClick={() => setShowArchiveModal(true)}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archive ({selectedSales.size})
            </button>
          )}
        </div>
      </div>

      {/* Info about datetime columns */}
      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-blue-400 text-sm">
          💡 <strong>System DateTime</strong> is automatically recorded and cannot be changed. 
          <strong> Store DateTime</strong> can be edited for earnings tracking purposes. Sales are grouped by transaction.
        </p>
      </div>

      {(() => {
        // Group sales by transaction_id
        const groupedSales = sales.reduce((acc, sale) => {
          const transactionId = (sale as ExtendedSale).transaction_id || sale.id
          if (!acc[transactionId]) {
            acc[transactionId] = []
          }
          acc[transactionId].push(sale)
          return acc
        }, {} as Record<string, ExtendedSale[]>)

        // Sort transactions by most recent
        const sortedTransactions = Object.entries(groupedSales).sort((a, b) => {
          const aTime = new Date(a[1][0].created_at).getTime()
          const bTime = new Date(b[1][0].created_at).getTime()
          return bTime - aTime
        })

        return sales.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No sales for this date</h3>
          <p className="text-surface-400 text-sm">Try selecting a different date</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedTransactions.map(([transactionId, transactionSales]) => {
            const transactionTotal = transactionSales.reduce((sum, s) => sum + s.total, 0)
            const firstSale = transactionSales[0]
            const isMultiProduct = transactionSales.length > 1
            
            return (
              <div key={transactionId} className="card overflow-hidden">
                {/* Transaction Header */}
                {isMultiProduct && (
                  <div className="bg-surface-800/50 px-4 py-2 border-b border-surface-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-surface-400">Transaction:</span>
                        <span className="text-xs text-primary-400 font-mono">{transactionId.substring(0, 8)}...</span>
                        <span className="text-xs text-surface-500">({transactionSales.length} items)</span>
                      </div>
                      <span className="text-sm font-bold text-primary-500">
                        Total: ₱{transactionTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-800">
                        <th className="p-4 text-left">
                          <input
                            type="checkbox"
                            checked={transactionSales.every(s => selectedSales.has(s.id))}
                            onChange={() => {
                              const allSelected = transactionSales.every(s => selectedSales.has(s.id))
                              if (allSelected) {
                                transactionSales.forEach(s => {
                                  const newSet = new Set(selectedSales)
                                  newSet.delete(s.id)
                                  setSelectedSales(newSet)
                                })
                              } else {
                                transactionSales.forEach(s => {
                                  const newSet = new Set(selectedSales)
                                  newSet.add(s.id)
                                  setSelectedSales(newSet)
                                })
                              }
                            }}
                            className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                          />
                        </th>
                        <th className="p-4 text-left text-sm font-medium text-surface-400">Item Name</th>
                        <th className="p-4 text-left text-sm font-medium text-surface-400">Payment</th>
                        <th className="p-4 text-left text-sm font-medium text-surface-400">Customer</th>
                        <th className="p-4 text-left text-sm font-medium text-surface-400">Type</th>
                        <th className="p-4 text-left text-sm font-medium text-surface-400">
                          <span className="text-surface-500">System DateTime</span>
                        </th>
                        <th className="p-4 text-left text-sm font-medium text-surface-400">
                          <span className="text-primary-400">Store DateTime</span>
                          <span className="text-xs text-surface-500 block">Click to edit</span>
                        </th>
                        <th className="p-4 text-right text-sm font-medium text-surface-400">Qty</th>
                        <th className="p-4 text-right text-sm font-medium text-surface-400">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionSales.map((sale, index) => (
                        <tr key={sale.id} className={`border-b border-surface-800/50 hover:bg-surface-800/30 ${index === transactionSales.length - 1 ? '' : ''}`}>
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={selectedSales.has(sale.id)}
                              onChange={() => toggleSelectSale(sale.id)}
                              className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                            />
                          </td>
                          <td className="p-4 text-white font-medium">{sale.product_name}</td>
                          <td className="p-4">
                            {editingSale === `${sale.id}-payment` ? (
                              <select
                                value={sale.payment_method}
                                onChange={(e) => {
                                  handleUpdateSale(sale.id, 'payment_method', e.target.value)
                                  // Update all sales in transaction
                                  if ((sale as ExtendedSale).transaction_id) {
                                    transactionSales.forEach(s => {
                                      if (s.id !== sale.id) {
                                        handleUpdateSale(s.id, 'payment_method', e.target.value)
                                      }
                                    })
                                  }
                                }}
                                onBlur={() => setEditingSale(null)}
                                autoFocus
                                className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                              >
                                {paymentMethods.map((pm) => (
                                  <option key={pm.id} value={pm.name}>{pm.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditingSale(`${sale.id}-payment`)}
                                className="text-surface-300 hover:text-white text-sm"
                              >
                                {sale.payment_method}
                              </button>
                            )}
                          </td>
                          <td className="p-4">
                            {editingSale === `${sale.id}-customer` ? (
                              <select
                                value={sale.customer_type}
                                onChange={(e) => {
                                  handleUpdateSale(sale.id, 'customer_type', e.target.value)
                                  // Update all sales in transaction
                                  if ((sale as ExtendedSale).transaction_id) {
                                    transactionSales.forEach(s => {
                                      if (s.id !== sale.id) {
                                        handleUpdateSale(s.id, 'customer_type', e.target.value)
                                      }
                                    })
                                  }
                                }}
                                onBlur={() => setEditingSale(null)}
                                autoFocus
                                className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                              >
                                {customerTypes.map((ct) => (
                                  <option key={ct.id} value={ct.name}>{ct.name}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditingSale(`${sale.id}-customer`)}
                                className="text-surface-300 hover:text-white text-sm"
                              >
                                {sale.customer_type}
                              </button>
                            )}
                          </td>
                          <td className="p-4">
                            {editingSale === `${sale.id}-dinein` ? (
                              <select
                                value={sale.dine_in_takeout || ''}
                                onChange={(e) => {
                                  handleUpdateSale(sale.id, 'dine_in_takeout', e.target.value)
                                  // Update all sales in transaction
                                  if ((sale as ExtendedSale).transaction_id) {
                                    transactionSales.forEach(s => {
                                      if (s.id !== sale.id) {
                                        handleUpdateSale(s.id, 'dine_in_takeout', e.target.value)
                                      }
                                    })
                                  }
                                }}
                                onBlur={() => setEditingSale(null)}
                                autoFocus
                                className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                              >
                                <option value="">N/A</option>
                                <option value="dine_in">Dine In</option>
                                <option value="takeout">Takeout</option>
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditingSale(`${sale.id}-dinein`)}
                                className="text-surface-300 hover:text-white text-sm"
                              >
                                {sale.dine_in_takeout === 'dine_in' ? '🍽️ Dine In' : sale.dine_in_takeout === 'takeout' ? '🥡 Takeout' : 'N/A'}
                              </button>
                            )}
                          </td>
                          {/* System DateTime - Immutable */}
                          <td className="p-4 text-surface-500 text-sm font-mono">
                            {format(new Date(sale.created_at), 'MMM d, yyyy h:mm a')}
                          </td>
                          {/* Store DateTime - Editable */}
                          <td className="p-4">
                            {editingSale === `${sale.id}-storetime` ? (
                              <input
                                type="datetime-local"
                                defaultValue={format(new Date(sale.store_sale_datetime || sale.created_at), "yyyy-MM-dd'T'HH:mm")}
                                onChange={(e) => handleUpdateStoreDateTime(sale.id, e.target.value)}
                                onBlur={() => setEditingSale(null)}
                                autoFocus
                                className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-sm"
                              />
                            ) : (
                              <button
                                onClick={() => setEditingSale(`${sale.id}-storetime`)}
                                className="text-primary-400 hover:text-primary-300 text-sm font-mono"
                              >
                                {format(new Date(sale.store_sale_datetime || sale.created_at), 'MMM d, yyyy h:mm a')}
                              </button>
                            )}
                          </td>
                          <td className="p-4 text-right text-white font-mono">
                            {sale.qty} {sale.unit_type === 'weight' ? 'g' : 'pcs'}
                          </td>
                          <td className="p-4 text-right text-primary-500 font-bold font-mono">
                            ₱{sale.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {isMultiProduct && (
                      <tfoot>
                        <tr className="bg-surface-800/30">
                          <td colSpan={8} className="p-4 text-right text-surface-400 font-medium">
                            Transaction Total:
                          </td>
                          <td className="p-4 text-right text-primary-500 font-bold text-lg font-mono">
                            ₱{transactionTotal.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          })}
          
          {/* Overall Total */}
          <div className="card p-4 bg-primary-500/10 border border-primary-500/20">
            <div className="flex items-center justify-between">
              <span className="text-surface-400 font-medium text-lg">Total Sales for Date:</span>
              <span className="text-primary-500 font-bold text-xl font-mono">
                ₱{sales.reduce((sum, s) => sum + s.total, 0).toFixed(2)}
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
            <p className="text-surface-400 text-sm mb-6">
              This deletes the data from the database and will download a CSV file of the selected reports. Click to proceed.
            </p>
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
                Proceed
              </button>
            </div>
          </div>
        </div>
      )
      })()}
    </div>
  )
}
