'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { Product, PaymentMethod, CustomerType, Setting } from '@/types/database'
import { useNotifications } from '@/contexts/NotificationContext'
import toast from 'react-hot-toast'

interface CartItem {
  product: Product
  quantity: number
}

export default function SalesPage() {
  const { addRecentSale } = useNotifications()
  const [products, setProducts] = useState<Product[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [dineInEnabled, setDineInEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('')
  const [selectedDineInTakeout, setSelectedDineInTakeout] = useState<'dine_in' | 'takeout' | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  // Product selection modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState<number>(1)

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, paymentRes, customerRes, settingsRes] = await Promise.all([
        supabase.from('products').select('*').gt('qty', 0).order('name'),
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('customer_types').select('*').order('name'),
        supabase.from('settings').select('*').eq('key', 'dine_in_takeout_enabled'),
      ])

      if (productsRes.data) setProducts(productsRes.data)
      if (paymentRes.data) setPaymentMethods(paymentRes.data)
      if (customerRes.data) setCustomerTypes(customerRes.data)
      if (settingsRes.data && settingsRes.data[0]) {
        setDineInEnabled(settingsRes.data[0].value === 'true')
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleProductClick = (product: Product) => {
    // Check if product is already in cart
    const existingItem = cart.find(item => item.product.id === product.id)
    if (existingItem) {
      setSelectedProduct(product)
      setQuantity(existingItem.quantity)
    } else {
      setSelectedProduct(product)
      setQuantity(product.unit_type === 'weight' ? 0.5 : 1)
    }
  }

  const closeProductModal = () => {
    setSelectedProduct(null)
    setQuantity(1)
  }

  const addToCart = () => {
    if (!selectedProduct) return
    if (quantity <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }
    if (quantity > selectedProduct.qty) {
      toast.error('Not enough stock available')
      return
    }

    // Check if product already exists in cart
    const existingIndex = cart.findIndex(item => item.product.id === selectedProduct.id)
    
    if (existingIndex >= 0) {
      // Update existing cart item
      const updatedCart = [...cart]
      updatedCart[existingIndex] = { ...updatedCart[existingIndex], quantity }
      setCart(updatedCart)
      toast.success('Cart updated')
    } else {
      // Add new item to cart
      setCart([...cart, { product: selectedProduct, quantity }])
      toast.success('Added to cart')
    }
    
    closeProductModal()
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId))
    toast.success('Removed from cart')
  }

  const updateCartQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }
    
    const product = cart.find(item => item.product.id === productId)?.product
    if (product && newQuantity > product.qty) {
      toast.error('Not enough stock available')
      return
    }

    setCart(cart.map(item => 
      item.product.id === productId 
        ? { ...item, quantity: newQuantity }
        : item
    ))
  }

  const clearCart = () => {
    setCart([])
    setSelectedPaymentMethod('')
    setSelectedCustomerType('')
    setSelectedDineInTakeout(null)
  }

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty')
      return
    }
    if (!selectedPaymentMethod) {
      toast.error('Please select a payment method')
      return
    }
    if (!selectedCustomerType) {
      toast.error('Please select a customer type')
      return
    }
    if (dineInEnabled && !selectedDineInTakeout) {
      toast.error('Please select Dine In or Takeout')
      return
    }

    // Validate all items have sufficient stock
    for (const item of cart) {
      if (item.quantity > item.product.qty) {
        toast.error(`Not enough stock for ${item.product.name}`)
        return
      }
    }

    setIsCheckingOut(true)

    try {
      // Generate transaction ID for grouping all items in this purchase
      const transactionId = crypto.randomUUID()

      // Create sale records for all items in cart
      const saleRecords = cart.map(item => ({
        transaction_id: transactionId,
        product_id: item.product.id,
        product_name: item.product.name,
        qty: item.quantity,
        unit_type: item.product.unit_type,
        cost: item.product.cost,
        selling_price: item.product.selling_price,
        total: item.quantity * item.product.selling_price,
        payment_method: selectedPaymentMethod,
        customer_type: selectedCustomerType,
        dine_in_takeout: dineInEnabled ? selectedDineInTakeout : null,
      }))
      
      const { data: saleData, error: saleError } = await (supabase as any)
        .from('sales')
        .insert(saleRecords)
        .select()

      if (saleError) throw saleError

      // Update inventory for all products
      const inventoryUpdates = cart.map(item => 
        (supabase as any)
          .from('products')
          .update({ qty: item.product.qty - item.quantity })
          .eq('id', item.product.id)
      )

      const inventoryResults = await Promise.all(inventoryUpdates)
      const inventoryErrors = inventoryResults.filter(r => r.error)
      if (inventoryErrors.length > 0) {
        throw new Error('Failed to update some inventory items')
      }

      // Add first sale to recent sales for notification
      if (saleData && saleData.length > 0) {
        addRecentSale(saleData[0])
      }

      const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.product.selling_price), 0)
      toast.success(`Sale completed! Total: ₱${totalAmount.toFixed(2)}`)
      
      clearCart()
      fetchData() // Refresh products
    } catch (error) {
      console.error('Error processing sale:', error)
      toast.error('Failed to process sale')
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.product.selling_price), 0)

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Sales</h1>
        <p className="text-surface-400 text-sm mt-1">Select products to add to cart</p>
      </div>

      {/* Cart Summary - Fixed at top when cart has items */}
      {cart.length > 0 && (
        <div className="card p-4 mb-6 sticky top-4 z-40">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Cart ({cart.length} {cart.length === 1 ? 'item' : 'items'})</h2>
            <button
              onClick={clearCart}
              className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
          </div>
          
          {/* Cart Items */}
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center justify-between p-2 bg-surface-800 rounded-lg">
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{item.product.name}</p>
                  <p className="text-surface-400 text-xs">
                    {item.quantity} {item.product.unit_type === 'weight' ? 'kg' : 'pcs'} × ₱{item.product.selling_price.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateCartQuantity(item.product.id, item.quantity - (item.product.unit_type === 'weight' ? 0.1 : 1))}
                      className="w-6 h-6 rounded bg-surface-700 hover:bg-surface-600 text-white flex items-center justify-center text-xs"
                    >
                      −
                    </button>
                    <span className="text-white text-sm font-mono w-12 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item.product.id, item.quantity + (item.product.unit_type === 'weight' ? 0.1 : 1))}
                      className="w-6 h-6 rounded bg-surface-700 hover:bg-surface-600 text-white flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-primary-500 font-bold text-sm w-20 text-right">
                    ₱{(item.quantity * item.product.selling_price).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-surface-500 hover:text-red-400 p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Payment & Customer Selection */}
          <div className="space-y-3 mb-4 pt-4 border-t border-surface-800">
            {/* Customer Type */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-2">Customer Type</label>
              <div className="flex flex-wrap gap-2">
                {customerTypes.length === 0 ? (
                  <p className="text-surface-500 text-xs">No customer types configured</p>
                ) : (
                  customerTypes.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setSelectedCustomerType(ct.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedCustomerType === ct.name
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141416]'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: ct.color, color: '#fff' }}
                    >
                      {ct.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-2">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.length === 0 ? (
                  <p className="text-surface-500 text-xs">No payment methods configured</p>
                ) : (
                  paymentMethods.map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => setSelectedPaymentMethod(pm.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedPaymentMethod === pm.name
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141416]'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: pm.color, color: '#fff' }}
                    >
                      {pm.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Dine In / Takeout */}
            {dineInEnabled && (
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-2">Dine In / Takeout</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDineInTakeout('dine_in')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedDineInTakeout === 'dine_in'
                        ? 'bg-blue-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    🍽️ Dine In
                  </button>
                  <button
                    onClick={() => setSelectedDineInTakeout('takeout')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedDineInTakeout === 'takeout'
                        ? 'bg-green-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    🥡 Takeout
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Total & Checkout */}
          <div className="pt-4 border-t border-surface-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-surface-400 font-medium">Total</span>
              <span className="text-2xl font-bold text-primary-500">
                ₱{cartTotal.toFixed(2)}
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={isCheckingOut || !selectedPaymentMethod || !selectedCustomerType || (dineInEnabled && !selectedDineInTakeout)}
              className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingOut ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                'Complete Purchase'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No products available</h3>
          <p className="text-surface-400 text-sm">Add products in the Inventory section first</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => handleProductClick(product)}
              className="card p-4 text-left hover:border-primary-500/50 transition-all group"
            >
              {/* Product Image */}
              <div className="aspect-square bg-surface-800 rounded-lg mb-3 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={getProductImageUrl(product.image_url) || ''}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Product Info */}
              <h3 className="font-medium text-white truncate mb-1">{product.name}</h3>
              <p className="text-primary-500 font-bold">₱{product.selling_price.toFixed(2)}</p>
              <p className="text-xs text-surface-500 mt-1">
                Stock: {product.qty} {product.unit_type === 'weight' ? 'kg' : 'pcs'}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Product Sale Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-surface-800 rounded-lg overflow-hidden flex-shrink-0">
                  {selectedProduct.image_url ? (
                    <img
                      src={getProductImageUrl(selectedProduct.image_url) || ''}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedProduct.name}</h2>
                  <p className="text-primary-500 font-bold text-lg">₱{selectedProduct.selling_price.toFixed(2)}</p>
                </div>
              </div>
              <button
                onClick={closeProductModal}
                className="text-surface-400 hover:text-white p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quantity */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Quantity ({selectedProduct.unit_type === 'weight' ? 'kg' : 'pcs'})
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(selectedProduct.unit_type === 'weight' ? 0.1 : 1, q - (selectedProduct.unit_type === 'weight' ? 0.1 : 1)))}
                  className="w-10 h-10 rounded-lg bg-surface-800 hover:bg-surface-700 text-white flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  step={selectedProduct.unit_type === 'weight' ? 0.1 : 1}
                  min={selectedProduct.unit_type === 'weight' ? 0.1 : 1}
                  max={selectedProduct.qty}
                  className="flex-1 px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-center font-mono text-lg"
                />
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedProduct.qty, q + (selectedProduct.unit_type === 'weight' ? 0.1 : 1)))}
                  className="w-10 h-10 rounded-lg bg-surface-800 hover:bg-surface-700 text-white flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-surface-500 mt-1">
                Available: {selectedProduct.qty} {selectedProduct.unit_type === 'weight' ? 'kg' : 'pcs'}
              </p>
            </div>

            {/* Add to Cart */}
            <div className="mt-6 pt-4 border-t border-surface-800">
              <div className="flex items-center justify-between mb-4">
                <span className="text-surface-400">Subtotal</span>
                <span className="text-xl font-bold text-primary-500">
                  ₱{(quantity * selectedProduct.selling_price).toFixed(2)}
                </span>
              </div>
              <button
                onClick={addToCart}
                disabled={quantity <= 0 || quantity > selectedProduct.qty}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


