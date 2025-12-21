'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getProductImageUrl, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase'
import { Product } from '@/types/database'
import imageCompression from 'browser-image-compression'
import toast from 'react-hot-toast'

interface FinishedProduct {
  id: string
  name: string
  image_url: string | null
  selling_price: number
  created_at: string
  updated_at: string
}

interface ProductIngredient {
  id: string
  product_id: string
  item_id: string
  qty: number
  item_name?: string
  item_unit_type?: 'weight' | 'quantity'
  item_cost?: number
}

export default function ProductsPage() {
  const [products, setProducts] = useState<FinishedProduct[]>([])
  const [inventoryItems, setInventoryItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<FinishedProduct | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    selling_price: 0,
  })
  const [ingredients, setIngredients] = useState<{ item_id: string; qty: number }[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('finished_products')
        .select('*')
        .order('name')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      // Table might not exist yet
      setProducts([])
    }
  }, [])

  const fetchInventoryItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (error) throw error
      setInventoryItems(data || [])
    } catch (error) {
      console.error('Error fetching inventory items:', error)
    }
  }, [])

  const fetchProductIngredients = useCallback(async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('product_ingredients')
        .select('*')
        .eq('product_id', productId)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching product ingredients:', error)
      return []
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchProducts(), fetchInventoryItems()]).finally(() => setLoading(false))
  }, [fetchProducts, fetchInventoryItems])

  const resetForm = () => {
    setFormData({
      name: '',
      selling_price: 0,
    })
    setIngredients([])
    setImageFile(null)
    setImagePreview(null)
  }

  const openAddModal = () => {
    resetForm()
    setEditingProduct(null)
    setShowAddModal(true)
  }

  const openEditModal = async (product: FinishedProduct) => {
    setFormData({
      name: product.name,
      selling_price: product.selling_price,
    })
    setImagePreview(product.image_url ? getProductImageUrl(product.image_url) : null)
    setImageFile(null)
    
    // Fetch ingredients for this product
    const productIngredients = await fetchProductIngredients(product.id)
    setIngredients(productIngredients.map(pi => ({ item_id: pi.item_id, qty: pi.qty })))
    
    setEditingProduct(product)
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingProduct(null)
    resetForm()
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const options = {
        maxSizeMB: 0.15,
        maxWidthOrHeight: 100,
        useWebWorker: true,
      }

      const compressedFile = await imageCompression(file, options)
      setImageFile(compressedFile)

      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(compressedFile)
    } catch (error) {
      console.error('Error compressing image:', error)
      toast.error('Failed to process image')
    }
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `product-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

      const { error, data } = await (supabase as any).storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Upload error:', error)
        toast.error(`Upload failed: ${error.message}`)
        return null
      }
      
      return fileName
    } catch (error: any) {
      console.error('Error uploading image:', error)
      toast.error(`Upload error: ${error?.message || 'Unknown error'}`)
      return null
    }
  }

  const addIngredient = () => {
    if (inventoryItems.length === 0) {
      toast.error('No inventory items available. Add items in Inventory first.')
      return
    }
    setIngredients([...ingredients, { item_id: '', qty: 0 }])
  }

  const updateIngredient = (index: number, field: 'item_id' | 'qty', value: string | number) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    setIngredients(updated)
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  // Calculate total cost from ingredients
  const calculateTotalCost = () => {
    return ingredients.reduce((total, ing) => {
      const item = inventoryItems.find(i => i.id === ing.item_id)
      if (!item) return total
      // qty is in grams for weight type, pieces for quantity type
      return total + (item.cost * ing.qty)
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Please enter a product name')
      return
    }

    if (ingredients.length === 0) {
      toast.error('Please add at least one ingredient')
      return
    }

    // Validate all ingredients have item selected and qty > 0
    const invalidIngredients = ingredients.filter(ing => !ing.item_id || ing.qty <= 0)
    if (invalidIngredients.length > 0) {
      toast.error('Please complete all ingredient selections')
      return
    }

    setIsSubmitting(true)

    try {
      let imagePath = editingProduct?.image_url || null

      if (imageFile) {
        const uploadedPath = await uploadImage(imageFile)
        if (uploadedPath) {
          if (editingProduct?.image_url) {
            await (supabase as any).storage
              .from(PRODUCT_IMAGES_BUCKET)
              .remove([editingProduct.image_url])
          }
          imagePath = uploadedPath
        }
      }

      const productData = {
        name: formData.name,
        selling_price: formData.selling_price,
        image_url: imagePath,
      }

      let productId = editingProduct?.id

      if (editingProduct) {
        const { error } = await (supabase as any)
          .from('finished_products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (error) throw error

        // Delete existing ingredients
        await (supabase as any)
          .from('product_ingredients')
          .delete()
          .eq('product_id', editingProduct.id)

        toast.success('Product updated!')
      } else {
        const { data, error } = await (supabase as any)
          .from('finished_products')
          .insert(productData)
          .select()
          .single()

        if (error) throw error
        productId = data.id
        toast.success('Product added!')
      }

      // Insert ingredients
      if (productId) {
        const ingredientRecords = ingredients.map(ing => ({
          product_id: productId,
          item_id: ing.item_id,
          qty: ing.qty,
        }))

        const { error: ingError } = await (supabase as any)
          .from('product_ingredients')
          .insert(ingredientRecords)

        if (ingError) throw ingError
      }

      closeModal()
      fetchProducts()
    } catch (error) {
      console.error('Error saving product:', error)
      toast.error('Failed to save product. Make sure the database tables exist.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (product: FinishedProduct) => {
    if (!confirm(`Delete "${product.name}"?`)) return

    try {
      if (product.image_url) {
        await (supabase as any).storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([product.image_url])
      }

      // Delete ingredients first
      await (supabase as any)
        .from('product_ingredients')
        .delete()
        .eq('product_id', product.id)

      const { error } = await (supabase as any)
        .from('finished_products')
        .delete()
        .eq('id', product.id)

      if (error) throw error
      toast.success('Product deleted')
      fetchProducts()
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product')
    }
  }

  const getItemById = (itemId: string) => inventoryItems.find(i => i.id === itemId)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-surface-400 text-sm mt-1">Create products from inventory ingredients</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </button>
      </div>

      {/* Info Card */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-blue-400 text-sm">
          💡 <strong>How this works:</strong> Create products by combining ingredients from your Inventory. 
          The total cost is automatically calculated based on the ingredients used.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No products yet</h3>
          <p className="text-surface-400 text-sm">Add your first product to start selling</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <div key={product.id} className="card p-4">
              <div className="aspect-square bg-surface-800 rounded-lg mb-3 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={getProductImageUrl(product.image_url) || ''}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              <h3 className="font-semibold text-white mb-2">{product.name}</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-400">Selling Price:</span>
                  <span className="text-primary-500 font-bold font-mono">₱{product.selling_price.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-surface-800">
                <button
                  onClick={() => openEditModal(product)}
                  className="flex-1 px-3 py-2 text-sm text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(product)}
                  className="flex-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={closeModal} className="text-surface-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Product Image (optional)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video bg-surface-800 border-2 border-dashed border-surface-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary-500/50 transition-colors overflow-hidden"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center p-4">
                      <svg className="w-8 h-8 text-surface-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-surface-500 text-sm">Click to upload</p>
                      <p className="text-surface-600 text-xs">Max 100x100px, 150KB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Product Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="Enter product name"
                  required
                />
              </div>

              {/* Ingredients */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-surface-300">
                    Ingredients
                  </label>
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="text-sm text-primary-500 hover:text-primary-400 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Ingredient
                  </button>
                </div>

                {ingredients.length === 0 ? (
                  <div className="p-4 bg-surface-800/50 rounded-lg text-center">
                    <p className="text-surface-500 text-sm">No ingredients added yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ingredients.map((ing, index) => {
                      const item = getItemById(ing.item_id)
                      return (
                        <div key={index} className="flex gap-2 items-start p-3 bg-surface-800/50 rounded-lg">
                          <div className="flex-1">
                            <select
                              value={ing.item_id}
                              onChange={(e) => updateIngredient(index, 'item_id', e.target.value)}
                              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm mb-2"
                            >
                              <option value="">Select item...</option>
                              {inventoryItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.unit_type === 'weight' ? 'g' : 'pcs'})
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={ing.qty}
                                onChange={(e) => updateIngredient(index, 'qty', parseFloat(e.target.value) || 0)}
                                min={0}
                                step={item?.unit_type === 'weight' ? 1 : 1}
                                className="w-24 px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-sm font-mono"
                                placeholder="Qty"
                              />
                              <span className="text-surface-500 text-sm">
                                {item?.unit_type === 'weight' ? 'g' : 'pcs'}
                              </span>
                              {item && (
                                <span className="text-surface-500 text-xs ml-auto">
                                  Cost: ₱{(item.cost * ing.qty).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeIngredient(index)}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Total Cost */}
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-yellow-400 text-sm font-medium">Total Ingredient Cost:</span>
                  <span className="text-yellow-400 font-mono font-bold">₱{calculateTotalCost().toFixed(2)}</span>
                </div>
                <p className="text-yellow-400/70 text-xs">⚠️ This is a pre-OPEX calculation.</p>
              </div>

              {/* Selling Price */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Selling Price (₱)
                </label>
                <input
                  type="number"
                  value={formData.selling_price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, selling_price: parseFloat(e.target.value) || 0 }))}
                  step={0.01}
                  min={0}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                />
              </div>

              {/* Profit Preview */}
              <div className="p-3 bg-surface-800/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-400">Gross Profit per unit:</span>
                  <span className={`font-mono font-bold ${formData.selling_price - calculateTotalCost() >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ₱{(formData.selling_price - calculateTotalCost()).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

