'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase'
import { Product } from '@/types/database'
import toast from 'react-hot-toast'

export default function InventoryPage() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Product | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state - totalCost is the total cost of entire quantity
  const [formData, setFormData] = useState({
    name: '',
    unit_type: 'quantity' as 'weight' | 'quantity',
    qty: '',
    totalCost: '', // Total cost for the entire stock
  })

  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error('Error fetching items:', error)
      toast.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const resetForm = () => {
    setFormData({
      name: '',
      unit_type: 'quantity',
      qty: '',
      totalCost: '',
    })
  }

  const openAddModal = () => {
    resetForm()
    setEditingItem(null)
    setShowAddModal(true)
  }

  const openEditModal = (item: Product) => {
    // Calculate total cost from stored per-unit cost
    const stockInDisplayUnit = item.unit_type === 'weight' ? item.qty * 1000 : item.qty
    const totalCost = item.cost * stockInDisplayUnit
    
    setFormData({
      name: item.name,
      unit_type: item.unit_type,
      qty: stockInDisplayUnit.toString(),
      totalCost: totalCost.toFixed(2),
    })
    setEditingItem(item)
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingItem(null)
    resetForm()
  }

  // Calculate per-unit cost from total cost and quantity
  const calculatePerUnitCost = (): number => {
    const qty = parseFloat(formData.qty) || 0
    const totalCost = parseFloat(formData.totalCost) || 0
    if (qty <= 0) return 0
    return totalCost / qty
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Please enter an item name')
      return
    }

    const qty = parseFloat(formData.qty) || 0
    if (qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setIsSubmitting(true)

    try {
      // Calculate per-unit cost
      const perUnitCost = calculatePerUnitCost()
      
      // For weight type, store qty in kg (divide grams by 1000)
      const storageQty = formData.unit_type === 'weight' ? qty / 1000 : qty

      const itemData: Record<string, any> = {
        name: formData.name,
        unit_type: formData.unit_type,
        qty: storageQty,
        cost: perUnitCost, // Per-unit cost (per gram or per piece)
        selling_price: 0, // Not used for inventory items
        image_url: null, // No image for inventory
      }

      if (editingItem) {
        // Delete old image if exists
        if (editingItem.image_url) {
          await (supabase as any).storage
            .from(PRODUCT_IMAGES_BUCKET)
            .remove([editingItem.image_url])
        }

        const { error } = await (supabase as any)
          .from('products')
          .update(itemData)
          .eq('id', editingItem.id)

        if (error) throw error
        toast.success('Item updated!')
      } else {
        const { error } = await (supabase as any)
          .from('products')
          .insert(itemData)

        if (error) throw error
        toast.success('Item added!')
      }

      closeModal()
      fetchItems()
    } catch (error) {
      console.error('Error saving item:', error)
      toast.error('Failed to save item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (item: Product) => {
    if (!confirm(`Delete "${item.name}"?`)) return

    try {
      // Delete image if exists
      if (item.image_url) {
        await (supabase as any).storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([item.image_url])
      }

      const { error } = await (supabase as any)
        .from('products')
        .delete()
        .eq('id', item.id)

      if (error) throw error
      toast.success('Item deleted')
      fetchItems()
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error('Failed to delete item')
    }
  }

  // Format quantity display
  const formatStock = (item: Product) => {
    if (item.unit_type === 'weight') {
      const grams = item.qty * 1000
      return `${grams.toLocaleString()} g`
    }
    return `${item.qty.toLocaleString()} pcs`
  }

  // Calculate total value
  const getTotalValue = (item: Product) => {
    const stockInDisplayUnit = item.unit_type === 'weight' ? item.qty * 1000 : item.qty
    return item.cost * stockInDisplayUnit
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const perUnitCost = calculatePerUnitCost()

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-surface-400 text-sm mt-1">Manage your raw materials and ingredients</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No items yet</h3>
          <p className="text-surface-400 text-sm">Add your first inventory item to get started</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800 bg-surface-800/50">
                <th className="p-4 text-left text-sm font-medium text-surface-400">Item Name</th>
                <th className="p-4 text-left text-sm font-medium text-surface-400">Unit Type</th>
                <th className="p-4 text-right text-sm font-medium text-surface-400">Stock</th>
                <th className="p-4 text-right text-sm font-medium text-surface-400">Cost/Unit</th>
                <th className="p-4 text-right text-sm font-medium text-surface-400">Total Value</th>
                <th className="p-4 text-center text-sm font-medium text-surface-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                  <td className="p-4 text-white font-medium">{item.name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      item.unit_type === 'weight' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {item.unit_type === 'weight' ? 'Grams' : 'Pieces'}
                    </span>
                  </td>
                  <td className="p-4 text-right text-white font-mono">{formatStock(item)}</td>
                  <td className="p-4 text-right text-surface-300 font-mono">
                    ₱{item.cost.toFixed(4)}/{item.unit_type === 'weight' ? 'g' : 'pc'}
                  </td>
                  <td className="p-4 text-right text-primary-500 font-bold font-mono">
                    ₱{getTotalValue(item).toFixed(2)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <button onClick={closeModal} className="text-surface-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Item Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="e.g., Rice, Sugar, Eggs"
                  required
                />
              </div>

              {/* Unit Type */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Unit Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, unit_type: 'quantity' }))}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.unit_type === 'quantity'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    Pieces (pcs)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, unit_type: 'weight' }))}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.unit_type === 'weight'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    Grams (g)
                  </button>
                </div>
              </div>

              {/* Stock Amount */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Stock Amount ({formData.unit_type === 'weight' ? 'grams' : 'pieces'})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.qty}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setFormData((prev) => ({ ...prev, qty: val }))
                    }
                  }}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                  placeholder={formData.unit_type === 'weight' ? 'e.g., 100000 (for 100kg)' : 'e.g., 50'}
                  required
                />
              </div>

              {/* Total Cost */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Total Cost (₱) <span className="text-surface-500 text-xs">for the entire quantity</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.totalCost}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setFormData((prev) => ({ ...prev, totalCost: val }))
                      }
                    }}
                    className="w-full pl-8 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                    placeholder="e.g., 5000"
                    required
                  />
                </div>
              </div>

              {/* Per Unit Cost Preview */}
              <div className="p-4 bg-surface-800/50 rounded-lg border border-surface-700">
                <div className="flex justify-between items-center">
                  <span className="text-surface-400">Cost per {formData.unit_type === 'weight' ? 'gram' : 'piece'}:</span>
                  <span className="font-mono font-bold text-primary-500 text-lg">
                    ₱{perUnitCost.toFixed(4)}
                  </span>
                </div>
                {formData.unit_type === 'weight' && parseFloat(formData.qty) > 0 && (
                  <p className="text-surface-500 text-xs mt-2">
                    {parseFloat(formData.qty).toLocaleString()}g = ₱{parseFloat(formData.totalCost || '0').toLocaleString()} → ₱{perUnitCost.toFixed(4)}/g
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
