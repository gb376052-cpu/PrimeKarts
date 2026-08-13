// API & Global State Variables
const API_URL = 'http://localhost:5000/api/products';
const AUTH_URL = 'http://localhost:5000/api/auth';
const ORDER_URL = 'http://localhost:5000/api/orders';

let productsData = []; 
let cartItems = JSON.parse(localStorage.getItem('amazon_cart')) || []; 
let cartCount = cartItems.reduce((acc, item) => acc + (item.quantity || 1), 0);

// Helper: Escape HTML to prevent XSS and broken string attributes
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Safely extract float numeric price
function getNumericPrice(price) {
  if (typeof price === 'number') return price;
  if (!price) return 0;
  const cleaned = price.toString().replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

// Global Storage & UI Helpers
function saveCartToStorage() {
  localStorage.setItem('amazon_cart', JSON.stringify(cartItems));
}

function updateCartCountUI() {
  cartCount = cartItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
  const cartCountElement = document.getElementById('cart-count');
  if (cartCountElement) cartCountElement.innerText = cartCount;
}

// Dynamically Inject Animation Keyframes for Toasts
if (!document.getElementById('toast-style-keyframes')) {
  const style = document.createElement('style');
  style.id = 'toast-style-keyframes';
  style.innerHTML = `
    @keyframes slideIn {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// Global Toast Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColor = type === 'success' ? '#2e7d32' : (type === 'error' ? '#d32f2f' : '#2196f3');
  
  toast.style.cssText = `
    background: ${bgColor};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 240px;
    animation: slideIn 0.3s ease-out;
    transition: opacity 0.3s ease;
    margin-bottom: 8px;
  `;

  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle')}"></i>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// EmailJS Notification Helper
function sendOrderConfirmationEmail(orderData, shippingDetails, userEmail) {
  if (typeof emailjs === 'undefined') {
    console.warn('EmailJS SDK not loaded.');
    return;
  }

  const templateParams = {
    to_name: shippingDetails.name || 'Customer',
    to_email: userEmail || '',
    order_id: orderData._id || 'N/A',
    total_amount: `₹${(orderData.totalAmount || 0).toLocaleString('en-IN')}`,
    payment_method: orderData.paymentMethod || 'UPI',
    shipping_address: `${shippingDetails.address}, Pincode: ${shippingDetails.pincode}, Phone: ${shippingDetails.phone}`,
    items_summary: (orderData.items || []).map(i => `${i.name} (x${i.quantity}) - ₹${(i.price * i.quantity).toLocaleString('en-IN')}`).join('\n')
  };

  emailjs.send("service_8qygxwu", "template_xz5jk91", templateParams)
    .then(() => {
      console.log('Order confirmation email sent successfully via EmailJS!');
    })
    .catch((error) => {
      console.error('EmailJS Email Error:', error);
    });
}

// Global Add To Cart Function
window.addToCart = function(productId) {
  const targetId = String(productId);
  const selectedProduct = productsData.find(p => String(p._id || p.id) === targetId);
  if (!selectedProduct) return;

  const existingItemIndex = cartItems.findIndex(item => String(item._id || item.id) === targetId);
  if (existingItemIndex > -1) {
    cartItems[existingItemIndex].quantity = (cartItems[existingItemIndex].quantity || 1) + 1;
  } else {
    cartItems.push({ ...selectedProduct, quantity: 1 });
  }

  saveCartToStorage();
  updateCartCountUI();
  showToast('Item added to cart!', 'success');

  const cartModal = document.getElementById('cart-modal');
  if (cartModal && cartModal.style.display === 'flex' && typeof window.renderCartModalItems === 'function') {
    window.renderCartModalItems();
  }
};

document.addEventListener('DOMContentLoaded', () => {

  // DOM Elements
  const productsContainer = document.getElementById('products-container');
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-btn');

  // Deliver to Pincode Click Handler
  const locationBtn = document.getElementById('location-btn') || document.querySelector('.nav-address');

  // Function to update Pincode Text on UI
  function updateDeliverToUI(pincode) {
    const pincodeDisplay = document.getElementById('nav-pincode-display') || document.querySelector('.add-second');
    if (pincodeDisplay) {
      pincodeDisplay.innerText = pincode;
    }
  }

  // Load stored pincode on startup
  const storedPincode = localStorage.getItem('amazon_pincode') || '248007';
  updateDeliverToUI(storedPincode);

  if (locationBtn) {
    locationBtn.style.cursor = 'pointer';
    
    locationBtn.addEventListener('click', () => {
      const currentPin = localStorage.getItem('amazon_pincode') || '248007';
      const newPincode = prompt('Enter your 6-digit delivery pincode:', currentPin);

      if (newPincode !== null) {
        const cleanPin = newPincode.trim();
        if (/^\d{6}$/.test(cleanPin)) {
          localStorage.setItem('amazon_pincode', cleanPin);
          updateDeliverToUI(cleanPin);

          // Cart modal ke pincode input field me auto-fill
          const shipPincodeInput = document.getElementById('ship-pincode');
          if (shipPincodeInput) {
            shipPincodeInput.value = cleanPin;
          }

          if (typeof showToast === 'function') {
            showToast(`Delivery pincode updated to ${cleanPin}!`, 'success');
          }
        } else {
          if (typeof showToast === 'function') {
            showToast('Please enter a valid 6-digit pincode.', 'error');
          }
        }
      }
    });
  }

  // Cart Modal Elements
  const openCartBtn = document.getElementById('open-cart-btn');
  const closeCartBtn = document.getElementById('close-cart-btn');
  const cartModal = document.getElementById('cart-modal');
  const cartItemsContainer = document.getElementById('cart-items-container');
  const cartTotalPrice = document.getElementById('cart-total-price');
  const checkoutBtn = document.getElementById('checkout-btn');

  // Shipping Form Inputs
  const shipNameInput = document.getElementById('ship-name');
  const shipPhoneInput = document.getElementById('ship-phone');
  const shipAddressInput = document.getElementById('ship-address');
  const shipPincodeInput = document.getElementById('ship-pincode');

  // Auth Elements
  const navSigninBtn = document.querySelector('.nav-signin');
  const authModal = document.getElementById('auth-modal');
  const closeAuthBtn = document.getElementById('close-auth-btn');
  const loginBox = document.getElementById('login-box');
  const signupBox = document.getElementById('signup-box');
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  // Orders Modal Elements
  const ordersModal = document.getElementById("orders-modal");
  const myOrdersBtn = document.getElementById("my-orders-btn");
  const closeOrdersBtn = document.getElementById("close-orders-btn");
  const ordersListContainer = document.getElementById("orders-list-container");

  // Product Details Modal Elements
  const detailModal = document.getElementById('product-detail-modal');
  const detailBody = document.getElementById('product-detail-body');
  const closeDetailBtn = document.getElementById('close-detail-modal');

  // State Variables
  let currentCategory = 'All';
  let currentSort = 'default';

  // Synchronize cart count on page load
  updateCartCountUI();

  // Cart Modal Toggles & Pre-filling Name if Logged In
  if (openCartBtn && cartModal) {
    openCartBtn.addEventListener('click', () => {
      cartModal.style.display = 'flex';
      renderCartModalItems();

      const user = JSON.parse(localStorage.getItem('amazon_user'));
      if (user && shipNameInput && !shipNameInput.value) {
        shipNameInput.value = user.name || '';
      }
    });
  }

  if (closeCartBtn && cartModal) {
    closeCartBtn.addEventListener('click', () => {
      cartModal.style.display = 'none';
    });
  }

  // Check Logged-in User Session on Load
  checkUserAuth();

  function checkUserAuth() {
    const user = JSON.parse(localStorage.getItem('amazon_user'));
    if (user && navSigninBtn) {
      navSigninBtn.innerHTML = `
        <p><span>Hello, ${escapeHTML(user.name)}</span></p>
        <p class="nav-second" id="logout-btn" style="color: #febd69; cursor: pointer;">Sign Out</p>
      `;

      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          localStorage.removeItem('amazon_user');
          localStorage.removeItem('amazon_token');
          showToast('Logged out successfully!', 'info');
          setTimeout(() => window.location.reload(), 500);
        });
      }
    }
  }

  // Auth Modal Toggles
  if (navSigninBtn) {
    navSigninBtn.addEventListener('click', () => {
      const user = localStorage.getItem('amazon_user');
      if (!user && authModal) {
        authModal.style.display = 'flex';
      }
    });
  }

  if (closeAuthBtn) {
    closeAuthBtn.addEventListener('click', () => {
      if (authModal) authModal.style.display = 'none';
    });
  }

  if (showSignupLink) {
    showSignupLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (loginBox) loginBox.style.display = 'none';
      if (signupBox) signupBox.style.display = 'block';
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (signupBox) signupBox.style.display = 'none';
      if (loginBox) loginBox.style.display = 'block';
    });
  }

  // Register API Call
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;

      try {
        const response = await fetch(`${AUTH_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('amazon_token', data.token);
          localStorage.setItem('amazon_user', JSON.stringify(data.user));
          showToast('Account created successfully!', 'success');
          if (authModal) authModal.style.display = 'none';
          checkUserAuth();
        } else {
          showToast(data.message || 'Registration failed', 'error');
        }
      } catch (err) {
        console.error('Signup error:', err);
        showToast('Server error during registration', 'error');
      }
    });
  }

  // Login API Call
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const response = await fetch(`${AUTH_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('amazon_token', data.token);
          localStorage.setItem('amazon_user', JSON.stringify(data.user));
          showToast('Logged in successfully!', 'success');
          if (authModal) authModal.style.display = 'none';
          checkUserAuth();
        } else {
          showToast(data.message || 'Login failed', 'error');
        }
      } catch (err) {
        console.error('Login error:', err);
        showToast('Server error during login', 'error');
      }
    });
  }

  // Fetch Products
  async function fetchProducts(searchQuery = '') {
    try {
      let url = API_URL;
      if (searchQuery) {
        url += `?search=${encodeURIComponent(searchQuery)}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      // Ensure data is array
      productsData = Array.isArray(data) ? data : [];
      applyFiltersAndSort();
    } catch (error) {
      console.error('Error fetching products from database:', error);
      if (productsContainer) {
        productsContainer.innerHTML = '<h3 style="grid-column: 1/-1; text-align: center; color: red;">Error connecting to Server! Make sure "node server.js" is running in Terminal.</h3>';
      }
    }
  }

  // Render Products Grid
  function renderProducts(products) {
    if (!productsContainer) return;

    if (!products || products.length === 0) {
      productsContainer.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: white; margin-top: 20px;">
          <h2>No products found</h2>
          <p style="margin-top: 10px; color: #555;">Try searching for <b>laptop</b>, <b>fashion</b>, <b>mobile</b>, or <b>kitchen</b>.</p>
        </div>
      `;
      return;
    }

    productsContainer.innerHTML = products.map(product => {
      const pId = product._id || product.id;
      const imgUrl = product.imageUrl || product.image || 'https://via.placeholder.com/200';
      const numericPrice = getNumericPrice(product.price);
      const formattedPrice = `₹${numericPrice.toLocaleString('en-IN')}`;

      return `
        <div class="product-card" data-id="${escapeHTML(pId)}">
          <img src="${escapeHTML(imgUrl)}" alt="${escapeHTML(product.title || product.name)}" onerror="this.src='https://via.placeholder.com/200';">
          <h3>${escapeHTML(product.title || product.name)}</h3>
          <p class="category">${escapeHTML(product.category || 'General')}</p>
          <p class="price">${formattedPrice}</p>
          <button class="add-to-cart-btn">Add to Cart</button>
        </div>
      `;
    }).join('');
  }

  // Search Logic
  function performSearch() {
    const query = searchInput ? searchInput.value.trim() : '';
    fetchProducts(query);
  }

  if (searchButton) searchButton.addEventListener('click', performSearch);
  if (searchInput) {
    searchInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') performSearch();
    });
  }

  // Filter & Sort Handling
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterButtons.forEach(b => {
        b.style.background = '#f0f2f2';
        b.style.fontWeight = 'normal';
        b.classList.remove('active');
      });

      e.target.style.background = '#ffd814';
      e.target.style.fontWeight = 'bold';
      e.target.classList.add('active');

      currentCategory = e.target.getAttribute('data-category');
      applyFiltersAndSort();
    });
  });

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFiltersAndSort();
    });
  }

  // Filter and Sort Logic
  function applyFiltersAndSort() {
    let filtered = [...productsData];

    if (currentCategory && currentCategory !== 'All') {
      const selectedCat = currentCategory.toLowerCase();

      filtered = filtered.filter(p => {
        const prodCat = (p.category || '').toLowerCase();
        const prodTitle = (p.title || p.name || '').toLowerCase();

        if (prodCat === selectedCat) return true;

        if (selectedCat === 'laptops' || selectedCat === 'laptop') {
          return prodCat.includes('laptop') || 
                 prodCat.includes('electronics') || 
                 prodCat.includes('computer') || 
                 prodTitle.includes('laptop') || 
                 prodTitle.includes('macbook');
        }

        if (selectedCat === 'mobiles' || selectedCat === 'mobile') {
          return prodCat.includes('mobile') || 
                 prodCat.includes('phone') || 
                 prodCat.includes('electronics') || 
                 prodTitle.includes('phone') || 
                 prodTitle.includes('iphone');
        }

        return prodCat.includes(selectedCat) || prodTitle.includes(selectedCat);
      });
    }

    if (currentSort === 'low-to-high') {
      filtered.sort((a, b) => getNumericPrice(a.price) - getNumericPrice(b.price));
    } else if (currentSort === 'high-to-low') {
      filtered.sort((a, b) => getNumericPrice(b.price) - getNumericPrice(a.price));
    }

    renderProducts(filtered);
  }

  // Product Details Modal & Cart Event Delegation
  if (productsContainer) {
    productsContainer.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card');
      if (!card) return;

      const productId = card.getAttribute('data-id');

      // Add to Cart button click
      if (e.target && e.target.classList.contains('add-to-cart-btn')) {
        window.addToCart(productId);

        const originalText = e.target.innerText;
        e.target.innerText = "Added!";
        e.target.style.background = "#25d366";
        e.target.style.color = "white";

        setTimeout(() => {
          e.target.innerText = originalText;
          e.target.style.background = "#ffd814";
          e.target.style.color = "black";
        }, 1200);
        return;
      }

      // Open Modal on Card Click
      const product = productsData.find(p => String(p._id || p.id) === String(productId));

      if (product && detailModal && detailBody) {
        const imgUrl = product.imageUrl || product.image || 'https://via.placeholder.com/200';
        const formattedPrice = `₹${getNumericPrice(product.price).toLocaleString('en-IN')}`;

        detailBody.innerHTML = `
          <div style="flex: 1; min-width: 200px; text-align: center;">
            <img src="${escapeHTML(imgUrl)}" alt="${escapeHTML(product.title || product.name)}" style="max-width: 100%; height: 230px; object-fit: contain;" onerror="this.src='https://via.placeholder.com/200';">
          </div>
          <div style="flex: 1.5; min-width: 220px;">
            <h2 style="font-size: 18px; color: #0f1111; margin-bottom: 8px;">${escapeHTML(product.title || product.name)}</h2>
            <p style="color: #007185; font-size: 13px; font-weight: bold; margin-bottom: 8px;">Category: ${escapeHTML(product.category || 'General')}</p>
            <div style="color: #ffa41c; font-size: 13px; margin-bottom: 10px;">
              <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star-half-stroke"></i>
              <span style="color: #007185; margin-left: 5px;">4.5 (128 ratings)</span>
            </div>
            <h3 style="color: #B12704; font-size: 22px; margin-bottom: 12px;">${formattedPrice}</h3>
            <p style="font-size: 13px; color: #555; line-height: 1.5; margin-bottom: 15px;">
              ${escapeHTML(product.description || 'High-quality product with top-tier features, durable build, and reliable performance.')}
            </p>
            <button id="modal-add-btn" data-id="${escapeHTML(product._id || product.id)}" style="background: #ffd814; border: 1px solid #fcd200; padding: 10px 18px; border-radius: 20px; font-weight: bold; cursor: pointer;">
              Add to Cart
            </button>
          </div>
        `;

        const modalAddBtn = document.getElementById('modal-add-btn');
        if (modalAddBtn) {
          modalAddBtn.addEventListener('click', function() {
            window.addToCart(this.getAttribute('data-id'));
          });
        }

        detailModal.style.display = 'flex';
      }
    });
  }

  if (closeDetailBtn && detailModal) {
    closeDetailBtn.addEventListener('click', () => {
      detailModal.style.display = 'none';
    });
  }

  // Render Cart Modal Items
  function renderCartModalItems() {
    if (!cartItemsContainer || !cartTotalPrice) return;

    const paymentBox = document.getElementById('payment-selection-box');
    const shippingBox = document.getElementById('shipping-address-box');

    if (cartItems.length === 0) {
      cartItemsContainer.innerHTML = '<p style="color: #777;">Your Amazon Cart is empty.</p>';
      cartTotalPrice.innerText = '₹0';
      if (paymentBox) paymentBox.style.display = 'none';
      if (shippingBox) shippingBox.style.display = 'none';
      return;
    }

    if (paymentBox) paymentBox.style.display = 'block';
    if (shippingBox) shippingBox.style.display = 'block';

    let html = '';
    let totalSum = 0;

    cartItems.forEach((item, index) => {
      const numericPrice = getNumericPrice(item.price);
      const itemQty = item.quantity || 1;
      const itemTotal = numericPrice * itemQty;
      totalSum += itemTotal;

      html += `
        <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <div style="flex: 1; padding-right: 10px;">
            <b style="font-size: 14px; color: #0f1111;">${escapeHTML(item.title || item.name)}</b>
            <p style="color: #B12704; font-weight: bold; margin-top: 4px; font-size: 13px;">₹${numericPrice.toLocaleString('en-IN')} x ${itemQty} = ₹${itemTotal.toLocaleString('en-IN')}</p>
          </div>
          
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="qty-btn decrease-btn" data-index="${index}" style="background: #e7e9ec; border: 1px solid #adb1b8; border-radius: 4px; width: 28px; height: 28px; cursor: pointer; font-weight: bold;">-</button>
            <span style="font-weight: bold; font-size: 14px; min-width: 18px; text-align: center;">${itemQty}</span>
            <button class="qty-btn increase-btn" data-index="${index}" style="background: #e7e9ec; border: 1px solid #adb1b8; border-radius: 4px; width: 28px; height: 28px; cursor: pointer; font-weight: bold;">+</button>
            <button class="remove-btn" data-index="${index}" style="background: #e74c3c; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 6px;">Delete</button>
          </div>
        </div>
      `;
    });

    cartItemsContainer.innerHTML = html;
    cartTotalPrice.innerText = '₹' + totalSum.toLocaleString('en-IN');
  }

  window.renderCartModalItems = renderCartModalItems;

  // Quantity Change & Item Removal Listener
  if (cartItemsContainer) {
    cartItemsContainer.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'), 10);
      if (isNaN(index)) return;

      if (e.target.classList.contains('increase-btn')) {
        cartItems[index].quantity = (cartItems[index].quantity || 1) + 1;
      } else if (e.target.classList.contains('decrease-btn')) {
        if (cartItems[index].quantity > 1) {
          cartItems[index].quantity--;
        } else {
          cartItems.splice(index, 1);
        }
      } else if (e.target.classList.contains('remove-btn')) {
        cartItems.splice(index, 1);
      } else {
        return;
      }

      saveCartToStorage();
      updateCartCountUI();
      renderCartModalItems();
    });
  }

  // Checkout Handler
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      if (cartItems.length === 0) {
        showToast("Your cart is empty! Add products first.", "error");
        return;
      }

      const token = localStorage.getItem('amazon_token');
      if (!token) {
        showToast("Please sign in to place an order!", "error");
        if (cartModal) cartModal.style.display = 'none';
        if (authModal) authModal.style.display = 'flex';
        return;
      }

      const name = shipNameInput ? shipNameInput.value.trim() : '';
      const phone = shipPhoneInput ? shipPhoneInput.value.trim() : '';
      const address = shipAddressInput ? shipAddressInput.value.trim() : '';
      const pincode = shipPincodeInput ? shipPincodeInput.value.trim() : '';

      if (!name || !phone || !address || !pincode) {
        showToast("Please fill in all delivery address details!", "error");
        return;
      }

      if (phone.length < 10) {
        showToast("Please enter a valid phone number!", "error");
        return;
      }

      const shippingDetails = { 
  fullName: name, 
  name: name, 
  phone, 
  address, 
  pincode 
};
      const selectedPaymentEl = document.querySelector('input[name="payment-method"]:checked');
      const paymentMethod = selectedPaymentEl ? selectedPaymentEl.value : 'UPI';

      let totalAmount = 0;

      const formattedItems = cartItems.map(item => {
        const priceNum = getNumericPrice(item.price);
        const qty = item.quantity || 1;
        totalAmount += (priceNum * qty);
        return {
          productId: item._id || item.id,
          name: item.title || item.name,
          price: priceNum,
          quantity: qty
        };
      });

      try {
        const response = await fetch(ORDER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            items: formattedItems,
            totalAmount,
            paymentMethod,
            shippingAddress: shippingDetails
          })
        });

        const data = await response.json();

        if (response.ok) {
          const order = data.order || data;
          const user = JSON.parse(localStorage.getItem('amazon_user')) || {};
          
          const orderDateTime = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });

          sendOrderConfirmationEmail(order, shippingDetails, user.email);

          cartItemsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px 10px;">
              <i class="fa-solid fa-circle-check" style="font-size: 45px; color: #25d366; margin-bottom: 10px;"></i>
              <h2 style="color: #0f1111; margin-bottom: 10px;">Order Placed Successfully!</h2>
              
              <div style="background: #f0f2f2; border: 1px solid #d5d9d9; border-radius: 8px; padding: 12px; margin: 15px 0; text-align: left; font-size: 13px; color: #333;">
                <p style="margin-bottom: 5px;"><strong>Order ID:</strong> ${escapeHTML(order._id || 'N/A')}</p>
                <p style="margin-bottom: 5px;"><strong>Date & Time:</strong> <span style="color: #007600; font-weight: bold;">${orderDateTime}</span></p>
                <p style="margin-bottom: 5px;"><strong>Deliver to:</strong> ${escapeHTML(shippingDetails.name)}, ${escapeHTML(shippingDetails.pincode)}</p>
                <p style="margin-bottom: 5px;"><strong>Payment Method:</strong> ${escapeHTML(order.paymentMethod || paymentMethod)}</p>
                <p style="font-size: 15px; margin-top: 8px; color: #B12704;"><strong>Total Paid:</strong> ₹${(order.totalAmount || totalAmount).toLocaleString('en-IN')}</p>
              </div>

              <button id="view-my-orders-btn" style="background: #ffd814; border: 1px solid #fcd200; border-radius: 8px; padding: 10px 20px; font-weight: bold; cursor: pointer; margin-top: 10px; width: 100%;">
                View My Orders
              </button>
            </div>
          `;

          const paymentBox = document.getElementById('payment-selection-box');
          const shippingBox = document.getElementById('shipping-address-box');
          if (paymentBox) paymentBox.style.display = 'none';
          if (shippingBox) shippingBox.style.display = 'none';

          const viewOrdersBtn = document.getElementById('view-my-orders-btn');
          if (viewOrdersBtn) {
            viewOrdersBtn.addEventListener('click', () => {
              if (cartModal) cartModal.style.display = 'none';
              if (ordersModal) ordersModal.style.display = 'flex';
              fetchUserOrders();
            });
          }

          cartItems = [];
          saveCartToStorage();
          updateCartCountUI();
          cartTotalPrice.innerText = '₹0';
          showToast("Order placed & confirmation sent!", "success");
        } else {
          showToast(data.message || 'Failed to place order', "error");
        }
      } catch (error) {
        console.error('Checkout error:', error);
        showToast('Server error while placing order', "error");
      }
    });
  }

  // Order History Fetching
  if (myOrdersBtn) {
    myOrdersBtn.addEventListener("click", () => {
      const token = localStorage.getItem("amazon_token");
      if (!token) {
        showToast("Please sign in to view your orders.", "error");
        if (authModal) authModal.style.display = "flex";
        return;
      }

      if (ordersModal) ordersModal.style.display = "flex";
      fetchUserOrders();
    });
  }

  if (closeOrdersBtn) {
    closeOrdersBtn.addEventListener("click", () => {
      if (ordersModal) ordersModal.style.display = "none";
    });
  }

  async function fetchUserOrders() {
    const token = localStorage.getItem("amazon_token");
    if (!ordersListContainer) return;

    ordersListContainer.innerHTML = "<p>Loading your orders...</p>";

    try {
      const response = await fetch(ORDER_URL, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const orders = await response.json();

      if (!response.ok) {
        ordersListContainer.innerHTML = `<p style="color:red;">${escapeHTML(orders.message || "Failed to load orders.")}</p>`;
        return;
      }

      if (!Array.isArray(orders) || orders.length === 0) {
        ordersListContainer.innerHTML = "<p>You have not placed any orders yet.</p>";
        return;
      }

      ordersListContainer.innerHTML = orders.map(order => {
        const orderDateTime = order.createdAt 
          ? new Date(order.createdAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })
          : 'Date Not Available';

        return `
          <div style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #fafafa;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; font-size: 12px; color: #555;">
              <span><strong>ID:</strong> ${escapeHTML(order._id)}</span>
              <span><strong>Date:</strong> ${orderDateTime}</span>
              <span><strong>Payment:</strong> <b style="color:#007600;">${escapeHTML(order.paymentMethod || 'UPI')}</b></span>
            </div>
            <div style="margin-top: 8px;">
              ${(order.items || []).map(item => `
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                  <span>${escapeHTML(item.name || item.title)} (x${item.quantity || 1})</span>
                  <span>₹${((item.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}</span>
                </div>
              `).join('')}
            </div>
            <div style="text-align: right; margin-top: 8px; font-weight: bold; font-size: 14px; color: #B12704;">
              Total: ₹${order.totalAmount ? order.totalAmount.toLocaleString('en-IN') : 0}
            </div>
          </div>
        `;
      }).join('');

    } catch (error) {
      console.error("Error fetching orders:", error);
      ordersListContainer.innerHTML = "<p style='color:red;'>Server error while loading orders.</p>";
    }
  }

  // Global Backdrop Click & Escape Key Handlers
  window.addEventListener('click', (e) => {
    if (e.target === detailModal) detailModal.style.display = 'none';
    if (e.target === cartModal) cartModal.style.display = 'none';
    if (e.target === authModal) authModal.style.display = 'none';
    if (e.target === ordersModal) ordersModal.style.display = 'none';
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (detailModal) detailModal.style.display = 'none';
      if (cartModal) cartModal.style.display = 'none';
      if (authModal) authModal.style.display = 'none';
      if (ordersModal) ordersModal.style.display = 'none';
    }
  });

  // Scroll to Top
  const backToTopBtn = document.getElementById('back-to-top');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Initial Fetch
  fetchProducts();
});