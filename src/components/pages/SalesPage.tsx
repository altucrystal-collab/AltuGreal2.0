'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, getProductImageUrl, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase'
import { PaymentMethod, CustomerType } from '@/types/database'
import { useNotifications } from '@/contexts/NotificationContext'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface FinishedProduct {
  id: string
  name: string
  image_url: string | null
  selling_price: number
  opex_cost: number
  created_at: string
  updated_at: string
}

interface ProductIngredient {
  id: string
  product_id: string
  item_id: string
  qty: number
}

interface InventoryItem {
  id: string
  name: string
  qty: number
  cost: number
  unit_type: 'weight' | 'quantity' | 'volume'
}

interface CartItem {
  product: FinishedProduct
  quantity: number
}

export default function SalesPage() {
  const { user } = useAuth()
  const { addRecentSale } = useNotifications()
  const [products, setProducts] = useState<FinishedProduct[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [productIngredients, setProductIngredients] = useState<Record<string, ProductIngredient[]>>({})
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [loading, setLoading] = useState(true)

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('')
  const [selectedDineInTakeout, setSelectedDineInTakeout] = useState<'dine_in' | 'takeout' | null>(null)
  const [customerPayment, setCustomerPayment] = useState<string>('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  // Product/Cart item modal state
  const [selectedProduct, setSelectedProduct] = useState<FinishedProduct | null>(null)
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null)
  const [modalQuantity, setModalQuantity] = useState<string>('1')

  // Delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState<FinishedProduct | null>(null)

  // Edit ingredients modal
  const [showEditIngredients, setShowEditIngredients] = useState(false)
  const [editingProductIngredients, setEditingProductIngredients] = useState<FinishedProduct | null>(null)
  const [editIngredientsList, setEditIngredientsList] = useState<{item_id: string, qty: number}[]>([])
  const [isSavingIngredients, setIsSavingIngredients] = useState(false)

  const isOwner = user?.role === 'owner'

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, inventoryRes, ingredientsRes, paymentRes, customerRes] = await Promise.all([
        supabase.from('finished_products').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
        supabase.from('product_ingredients').select('*'),
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('customer_types').select('*').order('name'),
      ])

      if (productsRes.data) setProducts(productsRes.data)
      if (inventoryRes.data) setInventoryItems(inventoryRes.data)
      
      if (ingredientsRes.data) {
        const grouped = ingredientsRes.data.reduce((acc: Record<string, ProductIngredient[]>, ing: ProductIngredient) => {
          if (!acc[ing.product_id]) acc[ing.product_id] = []
          acc[ing.product_id].push(ing)
          return acc
        }, {})
        setProductIngredients(grouped)
      }
      
      if (paymentRes.data) setPaymentMethods(paymentRes.data)
      if (customerRes.data) setCustomerTypes(customerRes.data)
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

  // Get inventory stock in the same unit as ingredients
  const getInventoryInIngredientUnit = (item: InventoryItem): number => {
    if (item.unit_type === 'weight') return item.qty * 1000 // kg to g
    if (item.unit_type === 'volume') return item.qty * 1000 // L to ml
    return item.qty // pieces
  }

  // Check if product is out of stock (any ingredient has 0 stock)
  const isProductOutOfStock = (product: FinishedProduct): boolean => {
    const ingredients = productIngredients[product.id] || []
    if (ingredients.length === 0) return true
    
    return ingredients.some(ing => {
      const item = inventoryItems.find(i => i.id === ing.item_id)
      if (!item) return true
      const availableQty = getInventoryInIngredientUnit(item)
      return availableQty < ing.qty
    })
  }

  // Calculate maximum quantity available for a product based on inventory
  // Takes into account items already in cart
  const getMaxAvailableQuantity = (product: FinishedProduct, excludeCurrentCart: boolean = false): number => {
    const ingredients = productIngredients[product.id] || []
    if (ingredients.length === 0) return 0
    
    // Calculate how much of each ingredient is already reserved in cart
    const reservedIngredients: Record<string, number> = {}
    if (!excludeCurrentCart) {
      for (const cartItem of cart) {
        if (cartItem.product.id === product.id) continue // Skip the product we're checking (for updates)
        const cartIngredients = productIngredients[cartItem.product.id] || []
        for (const ing of cartIngredients) {
          reservedIngredients[ing.item_id] = (reservedIngredients[ing.item_id] || 0) + (ing.qty * cartItem.quantity)
        }
      }
    }

    let maxQty = Infinity
    for (const ing of ingredients) {
      const item = inventoryItems.find(i => i.id === ing.item_id)
      if (!item) return 0
      
      const availableQty = getInventoryInIngredientUnit(item)
      const reserved = reservedIngredients[ing.item_id] || 0
      const effectiveAvailable = availableQty - reserved
      
      if (ing.qty > 0) {
        const possibleQty = Math.floor(effectiveAvailable / ing.qty)
        maxQty = Math.min(maxQty, possibleQty)
      }
    }
    
    return maxQty === Infinity ? 0 : Math.max(0, maxQty)
  }

  // Calculate product cost based on ingredients only (no OPEX per unit)
  const calculateProductCost = (product: FinishedProduct): number => {
    const ingredients = productIngredients[product.id] || []
    const ingredientCost = ingredients.reduce((total, ing) => {
      const item = inventoryItems.find(i => i.id === ing.item_id)
      return total + (item ? item.cost * ing.qty : 0)
    }, 0)
    return ingredientCost
  }

  // Cart calculations
  const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.product.selling_price), 0)
  const paymentAmount = parseFloat(customerPayment) || 0
  const changeAmount = paymentAmount - cartTotal

  // Check if checkout is valid
  const canCheckout = cart.length > 0 && 
    selectedPaymentMethod && 
    selectedCustomerType && 
    selectedDineInTakeout && 
    paymentAmount >= cartTotal

  // Generate transaction number (YY-MM-XXXXX format, resets monthly)
  const generateTransactionNumber = async (): Promise<string> => {
    const now = new Date()
    const yearMonth = format(now, 'yy-MM')
    
    try {
      // Get the highest transaction number for this month
      const { data } = await supabase
        .from('sales')
        .select('transaction_number')
        .like('transaction_number', `${yearMonth}-%`)
        .order('transaction_number', { ascending: false })
        .limit(1)

      let nextNum = 1
      if (data && data.length > 0 && data[0].transaction_number) {
        const lastNum = parseInt(data[0].transaction_number.split('-')[2]) || 0
        nextNum = lastNum + 1
      }

      return `${yearMonth}-${nextNum.toString().padStart(5, '0')}`
    } catch (error) {
      console.error('Error generating transaction number:', error)
      return `${yearMonth}-00001`
    }
  }

  // Open modal for product
  const handleProductClick = (product: FinishedProduct) => {
    const existingItem = cart.find(item => item.product.id === product.id)
    if (existingItem) {
      setEditingCartItem(existingItem)
      setModalQuantity(existingItem.quantity.toString())
    } else {
    setSelectedProduct(product)
      setModalQuantity('1')
    }
  }

  // Open modal for cart item
  const handleCartItemClick = (item: CartItem) => {
    setEditingCartItem(item)
    setModalQuantity(item.quantity.toString())
  }

  const closeModal = () => {
    setSelectedProduct(null)
    setEditingCartItem(null)
    setModalQuantity('1')
  }

  // Handle quantity input change
  const handleQuantityChange = (value: string) => {
    if (value === '') {
      setModalQuantity('')
      return
    }
    const num = parseInt(value)
    if (!isNaN(num) && num >= 0) {
      setModalQuantity(num.toString())
    }
  }

  // Handle payment input change
  const handlePaymentChange = (value: string) => {
    if (value === '') {
      setCustomerPayment('')
      return
    }
    const regex = /^\d*\.?\d{0,2}$/
    if (regex.test(value)) {
      setCustomerPayment(value)
    }
  }

  // Add or update cart
  const handleAddToCart = () => {
    const qty = parseInt(modalQuantity) || 0
    if (qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    const product = editingCartItem?.product || selectedProduct
    if (!product) return

    // Check inventory availability
    const maxAvailable = getMaxAvailableQuantity(product, false)
    const currentInCart = editingCartItem 
      ? 0 // When editing, we're replacing the quantity
      : cart.find(item => item.product.id === product.id)?.quantity || 0
    
    const totalRequested = editingCartItem ? qty : currentInCart + qty

    if (totalRequested > maxAvailable + currentInCart) {
      const available = maxAvailable
      toast.error(`Only ${available} available in stock`)
      return
    }

    if (editingCartItem) {
      if (qty > maxAvailable + editingCartItem.quantity) {
        toast.error(`Only ${maxAvailable + editingCartItem.quantity} available in stock`)
        return
      }
      setCart(cart.map(item => 
        item.product.id === editingCartItem.product.id 
          ? { ...item, quantity: qty }
          : item
      ))
      toast.success('Cart updated')
    } else if (selectedProduct) {
      const existingIndex = cart.findIndex(item => item.product.id === selectedProduct.id)
      if (existingIndex >= 0) {
        const newTotal = cart[existingIndex].quantity + qty
        if (newTotal > maxAvailable + cart[existingIndex].quantity) {
          toast.error(`Only ${maxAvailable + cart[existingIndex].quantity} available in stock`)
          return
        }
        const updatedCart = [...cart]
        updatedCart[existingIndex].quantity += qty
        setCart(updatedCart)
      } else {
        if (qty > maxAvailable) {
          toast.error(`Only ${maxAvailable} available in stock`)
          return
        }
        setCart([...cart, { product: selectedProduct, quantity: qty }])
      }
      toast.success('Added to cart')
    }
    closeModal()
  }

  // Remove item from cart
  const handleRemoveFromCart = () => {
    if (editingCartItem) {
      setCart(cart.filter(item => item.product.id !== editingCartItem.product.id))
      toast.success('Removed from cart')
      closeModal()
    }
  }

  // Clear cart
  const clearCart = () => {
    setCart([])
    setSelectedPaymentMethod('')
    setSelectedCustomerType('')
    setSelectedDineInTakeout(null)
    setCustomerPayment('')
  }

  // Delete product (owner only)
  const handleDeleteProduct = async () => {
    if (!deletingProduct) return

    try {
      // Delete product image if exists
      if (deletingProduct.image_url) {
        await (supabase as any).storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([deletingProduct.image_url])
      }

      // Delete ingredients first
      await (supabase as any)
        .from('product_ingredients')
        .delete()
        .eq('product_id', deletingProduct.id)

      // Delete the product
      const { error } = await (supabase as any)
        .from('finished_products')
        .delete()
        .eq('id', deletingProduct.id)

      if (error) throw error

      toast.success('Product deleted')
      setShowDeleteConfirm(false)
      setDeletingProduct(null)
      closeModal()
      fetchData()
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product')
    }
  }

  // Open delete confirmation
  const openDeleteConfirm = (product: FinishedProduct) => {
    setDeletingProduct(product)
    setShowDeleteConfirm(true)
  }

  // Open edit ingredients modal
  const openEditIngredients = (product: FinishedProduct) => {
    const ingredients = productIngredients[product.id] || []
    setEditIngredientsList(ingredients.map(ing => ({ item_id: ing.item_id, qty: ing.qty })))
    setEditingProductIngredients(product)
    setShowEditIngredients(true)
    closeModal()
  }

  // Add ingredient to edit list
  const addIngredientToEdit = (itemId: string) => {
    if (editIngredientsList.find(i => i.item_id === itemId)) {
      toast.error('Ingredient already added')
      return
    }
    setEditIngredientsList([...editIngredientsList, { item_id: itemId, qty: 1 }])
  }

  // Remove ingredient from edit list
  const removeIngredientFromEdit = (itemId: string) => {
    setEditIngredientsList(editIngredientsList.filter(i => i.item_id !== itemId))
  }

  // Update ingredient quantity in edit list
  const updateIngredientQty = (itemId: string, qty: number) => {
    setEditIngredientsList(editIngredientsList.map(i => 
      i.item_id === itemId ? { ...i, qty: Math.max(0, qty) } : i
    ))
  }

  // Save edited ingredients
  const saveEditedIngredients = async () => {
    if (!editingProductIngredients) return
    if (editIngredientsList.length === 0) {
      toast.error('Add at least one ingredient')
      return
    }

    setIsSavingIngredients(true)
    try {
      // Delete old ingredients
      await (supabase as any)
        .from('product_ingredients')
        .delete()
        .eq('product_id', editingProductIngredients.id)

      // Insert new ingredients
      const ingredientsToInsert = editIngredientsList.map(ing => ({
        product_id: editingProductIngredients.id,
        item_id: ing.item_id,
        qty: ing.qty,
      }))

      const { error } = await (supabase as any)
        .from('product_ingredients')
        .insert(ingredientsToInsert)

      if (error) throw error

      toast.success('Ingredients updated!')
      setShowEditIngredients(false)
      setEditingProductIngredients(null)
      setEditIngredientsList([])
      fetchData()
    } catch (error) {
      console.error('Error saving ingredients:', error)
      toast.error('Failed to save ingredients')
    } finally {
      setIsSavingIngredients(false)
    }
  }

  // Close edit ingredients modal
  const closeEditIngredients = () => {
    setShowEditIngredients(false)
    setEditingProductIngredients(null)
    setEditIngredientsList([])
  }

  // Handle checkout
  const handleCheckout = async () => {
    if (!canCheckout) return

    setIsCheckingOut(true)

    try {
      const transactionId = crypto.randomUUID()
      const transactionNumber = await generateTransactionNumber()

      // Calculate ingredient deductions
      const ingredientDeductions: Record<string, number> = {}
      for (const item of cart) {
        const ingredients = productIngredients[item.product.id] || []
        for (const ing of ingredients) {
          ingredientDeductions[ing.item_id] = (ingredientDeductions[ing.item_id] || 0) + (ing.qty * item.quantity)
        }
      }

      // Create sale records (cost is ingredient cost only, no OPEX per unit)
      const saleRecords = cart.map(item => ({
        transaction_id: transactionId,
        transaction_number: transactionNumber,
        product_id: item.product.id,
        product_name: item.product.name,
        qty: item.quantity,
        unit_type: 'quantity' as const,
        cost: calculateProductCost(item.product),
        selling_price: item.product.selling_price,
        total: item.quantity * item.product.selling_price,
        payment_method: selectedPaymentMethod,
        customer_type: selectedCustomerType,
        dine_in_takeout: selectedDineInTakeout,
        customer_payment: paymentAmount,
      }))
      
      const { data: saleData, error: saleError } = await (supabase as any)
        .from('sales')
        .insert(saleRecords)
        .select()

      if (saleError) {
        console.error('Sale insert error:', saleError)
        throw saleError
      }

      // Deduct ingredients from inventory
      for (const [itemId, deduction] of Object.entries(ingredientDeductions)) {
        const item = inventoryItems.find(i => i.id === itemId)
        if (!item) continue
        
        // Convert deduction to storage unit
        let deductionInStorageUnit = deduction
        if (item.unit_type === 'weight') deductionInStorageUnit = deduction / 1000 // g to kg
        if (item.unit_type === 'volume') deductionInStorageUnit = deduction / 1000 // ml to L
        
        const newQty = Math.max(0, item.qty - deductionInStorageUnit)
        
        const { error: updateError } = await (supabase as any)
        .from('products')
          .update({ qty: newQty })
          .eq('id', itemId)
        
        if (updateError) {
          console.error(`Failed to update inventory for ${item.name}:`, updateError)
        }
      }

      if (saleData && saleData.length > 0) {
        addRecentSale(saleData[0])
      }

      toast.success(`Sale completed! Transaction: ${transactionNumber}`)
      clearCart()
      fetchData()
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

  // Filter products that have ingredients
  const availableProducts = products.filter(p => (productIngredients[p.id] || []).length > 0)

  const currentProduct = editingCartItem?.product || selectedProduct

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-full">
      {/* Top Section - Cart & Checkout */}
      <div className="card p-4 mb-4">
        {/* Cart Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Cart {cart.length > 0 && `(${cart.reduce((sum, i) => sum + i.quantity, 0)} items)`}
          </h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-sm text-red-400 hover:text-red-300">
              Clear Cart
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="min-h-[60px] max-h-32 overflow-y-auto mb-4 p-2 bg-surface-800/50 rounded-lg">
          {cart.length === 0 ? (
            <p className="text-surface-500 text-sm text-center py-4">No items in cart</p>
          ) : (
            <div className="space-y-1">
              {cart.map((item) => (
                <button
                  key={item.product.id}
                  onClick={() => handleCartItemClick(item)}
                  className="w-full flex items-center justify-between p-2 hover:bg-surface-700/50 rounded transition-colors text-left"
                >
                  <span className="text-white text-sm">{item.product.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-surface-400 text-sm">{item.quantity} pcs</span>
                    <span className="text-primary-500 font-mono text-sm">₱{(item.quantity * item.product.selling_price).toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selection Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* Customer Type */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Customer Type</label>
            <div className="flex flex-wrap gap-1">
              {customerTypes.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setSelectedCustomerType(ct.name)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    selectedCustomerType === ct.name
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-surface-900'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: ct.color, color: '#fff' }}
                >
                  {ct.name}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Payment Method</label>
            <div className="flex flex-wrap gap-1">
              {paymentMethods.map((pm) => (
                <button
                  key={pm.id}
                  onClick={() => setSelectedPaymentMethod(pm.name)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    selectedPaymentMethod === pm.name
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-surface-900'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: pm.color, color: '#fff' }}
                >
                  {pm.name}
                </button>
              ))}
            </div>
          </div>

          {/* Dine In / Takeout */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Order Type</label>
            <div className="flex gap-1">
              <button
                onClick={() => setSelectedDineInTakeout('dine_in')}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                  selectedDineInTakeout === 'dine_in'
                    ? 'bg-blue-500 text-white'
                    : 'bg-surface-700 text-surface-400 hover:bg-surface-600'
                }`}
              >
                Dine In
              </button>
              <button
                onClick={() => setSelectedDineInTakeout('takeout')}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-all ${
                  selectedDineInTakeout === 'takeout'
                    ? 'bg-green-500 text-white'
                    : 'bg-surface-700 text-surface-400 hover:bg-surface-600'
                }`}
              >
                Takeout
              </button>
            </div>
          </div>
        </div>

        {/* Payment Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          {/* Payment Input */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Payment</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">₱</span>
              <input
                type="text"
                inputMode="decimal"
                value={customerPayment}
                onChange={(e) => handlePaymentChange(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono text-right"
              />
            </div>
          </div>

          {/* Total Display */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Total</label>
            <div className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-primary-500 font-mono font-bold text-right">
              ₱{cartTotal.toFixed(2)}
            </div>
          </div>

          {/* Change Display */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1">Change</label>
            <div className={`px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg font-mono font-bold text-right ${
              changeAmount >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              ₱{changeAmount.toFixed(2)}
            </div>
      </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={!canCheckout || isCheckingOut}
            className="py-2 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCheckingOut ? 'Processing...' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* Bottom Section - Products Grid */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-3">Products</h3>
        {availableProducts.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-surface-400">No products available. Create products in the Inventory section.</p>
        </div>
      ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {availableProducts.map((product) => {
              const outOfStock = isProductOutOfStock(product)
              return (
            <button
              key={product.id}
                  onClick={() => !outOfStock && handleProductClick(product)}
                  disabled={outOfStock}
                  className={`card p-3 text-left transition-all group ${
                    outOfStock 
                      ? 'opacity-40 cursor-not-allowed grayscale' 
                      : 'hover:border-primary-500/50'
                  }`}
                >
                  <div className="aspect-square bg-surface-800 rounded-lg mb-2 overflow-hidden relative">
                {product.image_url ? (
                  <img
                    src={getProductImageUrl(product.image_url) || ''}
                    alt={product.name}
                        className={`w-full h-full object-cover transition-transform ${!outOfStock ? 'group-hover:scale-105' : ''}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                    {outOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="text-xs font-medium text-red-400 bg-red-500/20 px-2 py-1 rounded">
                          Out of Stock
                        </span>
                  </div>
                )}
              </div>
                  <h4 className={`font-medium text-xs truncate ${outOfStock ? 'text-surface-500' : 'text-white'}`}>{product.name}</h4>
                  <p className={`font-bold text-sm ${outOfStock ? 'text-surface-600' : 'text-primary-500'}`}>₱{product.selling_price.toFixed(2)}</p>
            </button>
              )
            })}
        </div>
      )}
      </div>

      {/* Product/Cart Item Modal */}
      {currentProduct && !showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-sm w-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-surface-800 rounded-lg overflow-hidden flex-shrink-0">
                  {currentProduct.image_url ? (
                    <img
                      src={getProductImageUrl(currentProduct.image_url) || ''}
                      alt={currentProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{currentProduct.name}</h3>
                  <p className="text-primary-500 font-bold">₱{currentProduct.selling_price.toFixed(2)}</p>
                </div>
              </div>
              <button onClick={closeModal} className="text-surface-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quantity Controls */}
            {(() => {
              const currentCartQty = editingCartItem ? editingCartItem.quantity : (cart.find(item => item.product.id === currentProduct.id)?.quantity || 0)
              const maxAvailable = getMaxAvailableQuantity(currentProduct, false) + currentCartQty
              const currentQty = parseInt(modalQuantity) || 0
              
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-surface-300">Quantity</label>
                    <span className="text-xs text-surface-500">Max: {maxAvailable} available</span>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => handleQuantityChange(Math.max(1, currentQty - 1).toString())}
                      className="w-14 h-14 flex-shrink-0 rounded-lg bg-surface-700 hover:bg-surface-600 text-white flex items-center justify-center text-2xl font-bold border border-surface-600 transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={modalQuantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0
                        if (val <= maxAvailable) {
                          handleQuantityChange(e.target.value)
                        } else {
                          handleQuantityChange(maxAvailable.toString())
                        }
                      }}
                      className="w-24 px-4 py-3 bg-surface-800 border border-surface-700 rounded-lg text-white text-center font-mono text-xl"
                    />
                    <button
                      onClick={() => {
                        const newQty = currentQty + 1
                        if (newQty <= maxAvailable) {
                          handleQuantityChange(newQty.toString())
                        } else {
                          toast.error(`Only ${maxAvailable} available in stock`)
                        }
                      }}
                      disabled={currentQty >= maxAvailable}
                      className="w-14 h-14 flex-shrink-0 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center text-2xl font-bold border border-surface-600 transition-colors"
                    >
                      +
                    </button>
                  </div>
                  {currentQty >= maxAvailable && maxAvailable > 0 && (
                    <p className="text-yellow-400 text-xs text-center mt-2">Maximum stock reached</p>
                  )}
                </div>
              )
            })()}

            {/* Subtotal */}
            <div className="flex items-center justify-between mb-4 p-3 bg-surface-800/50 rounded-lg">
              <span className="text-surface-400">Subtotal</span>
              <span className="text-xl font-bold text-primary-500">
                ₱{((parseInt(modalQuantity) || 0) * currentProduct.selling_price).toFixed(2)}
              </span>
            </div>

            {/* Action Buttons */}
                <div className="flex gap-2">
              {editingCartItem && (
                  <button
                  onClick={handleRemoveFromCart}
                  className="flex-1 py-3 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold rounded-lg transition-colors"
                >
                  Remove
                  </button>
              )}
                  <button
                onClick={handleAddToCart}
                disabled={(parseInt(modalQuantity) || 0) <= 0}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {editingCartItem ? 'Update Cart' : 'Add to Cart'}
                  </button>
                </div>

            {/* Owner Actions */}
            {isOwner && !editingCartItem && (
              <div className="mt-3 pt-3 border-t border-surface-800 space-y-2">
                <button
                  onClick={() => openEditIngredients(currentProduct)}
                  className="w-full py-2 text-primary-400 hover:text-primary-300 text-sm flex items-center justify-center gap-2 hover:bg-surface-800/50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit Ingredients
                </button>
                <button
                  onClick={() => openDeleteConfirm(currentProduct)}
                  className="w-full py-2 text-red-400 hover:text-red-300 text-sm flex items-center justify-center gap-2 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Product
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Product?</h3>
            <p className="text-surface-400 text-sm mb-4">
              Are you sure you want to delete <strong className="text-white">{deletingProduct.name}</strong>? 
              This will remove the product and all its ingredients from the system.
            </p>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <p className="text-red-400 text-sm">
                ⚠️ This action cannot be undone.
              </p>
              </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeletingProduct(null)
                }}
                className="flex-1 px-4 py-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProduct}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ingredients Modal */}
      {showEditIngredients && editingProductIngredients && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Edit Ingredients: {editingProductIngredients.name}
              </h3>
              <button onClick={closeEditIngredients} className="text-surface-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Current Ingredients */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-surface-400 mb-2">Current Ingredients</h4>
              {editIngredientsList.length === 0 ? (
                <p className="text-surface-500 text-sm p-3 bg-surface-800/50 rounded-lg">No ingredients added</p>
              ) : (
                <div className="space-y-2">
                  {editIngredientsList.map((ing) => {
                    const item = inventoryItems.find(i => i.id === ing.item_id)
                    if (!item) return null
                    const unitLabel = item.unit_type === 'weight' ? 'g' : item.unit_type === 'volume' ? 'ml' : 'pcs'
                    return (
                      <div key={ing.item_id} className="flex items-center gap-3 p-3 bg-surface-800/50 rounded-lg">
                        <span className="flex-1 text-white text-sm">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateIngredientQty(ing.item_id, ing.qty - 1)}
                            className="w-8 h-8 flex items-center justify-center bg-surface-700 hover:bg-surface-600 rounded text-white"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={ing.qty}
                            onChange={(e) => updateIngredientQty(ing.item_id, parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 bg-surface-800 border border-surface-700 rounded text-white text-center font-mono text-sm"
                          />
                          <span className="text-surface-400 text-xs w-8">{unitLabel}</span>
                          <button
                            onClick={() => updateIngredientQty(ing.item_id, ing.qty + 1)}
                            className="w-8 h-8 flex items-center justify-center bg-surface-700 hover:bg-surface-600 rounded text-white"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => removeIngredientFromEdit(ing.item_id)}
                          className="p-1 text-red-400 hover:text-red-300"
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

            {/* Add Ingredient */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-surface-400 mb-2">Add Ingredient</h4>
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-surface-800/30 rounded-lg">
                {inventoryItems
                  .filter(item => !editIngredientsList.find(i => i.item_id === item.id))
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addIngredientToEdit(item.id)}
                      className="p-2 text-xs bg-surface-800 hover:bg-surface-700 text-white rounded-lg transition-colors truncate"
                    >
                      {item.name}
                    </button>
                  ))}
              </div>
              {inventoryItems.filter(item => !editIngredientsList.find(i => i.item_id === item.id)).length === 0 && (
                <p className="text-surface-500 text-sm text-center py-2">All items already added</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={closeEditIngredients}
                className="flex-1 px-4 py-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedIngredients}
                disabled={isSavingIngredients || editIngredientsList.length === 0}
                className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isSavingIngredients ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
