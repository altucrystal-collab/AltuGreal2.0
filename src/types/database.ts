export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          name: string
          image_url: string | null
          unit_type: 'weight' | 'quantity'
          qty: number
          cost: number
          selling_price: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      sales: {
        Row: {
          id: string
          product_id: string
          product_name: string
          qty: number
          unit_type: 'weight' | 'quantity'
          cost: number
          selling_price: number
          total: number
          payment_method: string
          customer_type: string
          dine_in_takeout: 'dine_in' | 'takeout' | null
          created_at: string
          cancelled: boolean
          cancelled_at: string | null
          transaction_id: string | null
          store_sale_datetime: string | null
        }
        Insert: Omit<Database['public']['Tables']['sales']['Row'], 'id' | 'created_at' | 'cancelled' | 'cancelled_at'>
        Update: Partial<Database['public']['Tables']['sales']['Insert'] & { cancelled: boolean; cancelled_at: string | null }>
      }
      payment_methods: {
        Row: {
          id: string
          name: string
          color: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['payment_methods']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['payment_methods']['Insert']>
      }
      customer_types: {
        Row: {
          id: string
          name: string
          color: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['customer_types']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['customer_types']['Insert']>
      }
      settings: {
        Row: {
          id: string
          key: string
          value: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['settings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['settings']['Insert']>
      }
    }
  }
}

export type Product = Database['public']['Tables']['products']['Row']
export type Sale = Database['public']['Tables']['sales']['Row']
export type PaymentMethod = Database['public']['Tables']['payment_methods']['Row']
export type CustomerType = Database['public']['Tables']['customer_types']['Row']
export type Setting = Database['public']['Tables']['settings']['Row']

export type UserRole = 'owner' | 'cashier'

export interface User {
  username: string
  role: UserRole
}

export interface CartItem {
  product: Product
  qty: number
  customerType: string
  paymentMethod: string
  dineInTakeout: 'dine_in' | 'takeout' | null
}

export interface RecentSale {
  sale: Sale
  expiresAt: number
}



