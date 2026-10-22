/**
 * ANTARYA Kirana Business Dataset
 * Generates 30 realistic Indian Kirana customers, 21 products, and itemized sales transactions
 * totaling EXACTLY ₹4,000 in aggregate customer sales revenue.
 * All metrics (revenue, collections, credit, item prices) are 100% mathematically consistent.
 */

const DEMO_PRODUCTS = [
  { id: 'PROD-101', name: 'Aashirvaad Shudh Chakki Atta 1kg', nameHindi: 'आटा १ किलो', category: 'Grains & Flour', sellingPrice: 55, costPrice: 45, unit: 'kg', minStock: 10, quantity: 28, emoji: '🌾' },
  { id: 'PROD-102', name: 'India Gate Basmati Rice 1kg', nameHindi: 'बासमती चावल १ किलो', category: 'Grains & Flour', sellingPrice: 85, costPrice: 70, unit: 'kg', minStock: 8, quantity: 18, emoji: '🍚' },
  { id: 'PROD-103', name: 'Madhur Pure Sugar 1kg', nameHindi: 'चीनी १ किलो', category: 'Essentials', sellingPrice: 48, costPrice: 40, unit: 'kg', minStock: 15, quantity: 45, emoji: '🧂' },
  { id: 'PROD-104', name: 'Fortune Sunflower Oil 500ml', nameHindi: 'फॉर्च्यून तेल', category: 'Cooking Oil', sellingPrice: 85, costPrice: 70, unit: 'pc', minStock: 12, quantity: 22, emoji: '🛢️' },
  { id: 'PROD-105', name: 'Amul Taaza Toned Milk 500ml', nameHindi: 'अमूल ताजा दूध', category: 'Dairy', sellingPrice: 32, costPrice: 28, unit: 'pc', minStock: 15, quantity: 30, emoji: '🥛' },
  { id: 'PROD-106', name: 'Amul Salted Butter 100g', nameHindi: 'अमूल मक्खन १०० ग्राम', category: 'Dairy', sellingPrice: 58, costPrice: 50, unit: 'pc', minStock: 6, quantity: 14, emoji: '🧈' },
  { id: 'PROD-107', name: 'Tata Tea Gold 100g', nameHindi: 'टाटा चाय १०० ग्राम', category: 'Beverages', sellingPrice: 55, costPrice: 45, unit: 'pc', minStock: 8, quantity: 16, emoji: '🍵' },
  { id: 'PROD-108', name: 'Nescafe Classic Sachet 25g', nameHindi: 'नेस्कैफे कॉफी', category: 'Beverages', sellingPrice: 45, costPrice: 36, unit: 'pc', minStock: 5, quantity: 12, emoji: '☕' },
  { id: 'PROD-109', name: 'Maggi 2-Minute Noodles 70g', nameHindi: 'मैगी नूडल्स', category: 'Packaged Food', sellingPrice: 14, costPrice: 11, unit: 'pc', minStock: 20, quantity: 60, emoji: '🍜' },
  { id: 'PROD-110', name: 'Britannia Good Day Biscuits', nameHindi: 'गुड डे बिस्कुट', category: 'Snacks', sellingPrice: 30, costPrice: 24, unit: 'pc', minStock: 15, quantity: 34, emoji: '🍪' },
  { id: 'PROD-111', name: 'Parle-G Glucose Biscuits 250g', nameHindi: 'पारले-जी बिस्कुट', category: 'Snacks', sellingPrice: 25, costPrice: 20, unit: 'pc', minStock: 10, quantity: 25, emoji: '🍪' },
  { id: 'PROD-112', name: 'Dettol Bathing Soap 75g', nameHindi: 'डेटॉल साबुन', category: 'Personal Care', sellingPrice: 40, costPrice: 32, unit: 'pc', minStock: 8, quantity: 19, emoji: '🧼' },
  { id: 'PROD-113', name: 'Clinic Plus Shampoo 80ml', nameHindi: 'शैम्पू ८० मिली', category: 'Personal Care', sellingPrice: 65, costPrice: 52, unit: 'pc', minStock: 5, quantity: 9, emoji: '🧴' },
  { id: 'PROD-114', name: 'Colgate Strong Teeth 100g', nameHindi: 'कोलगेट टूथपेस्ट', category: 'Personal Care', sellingPrice: 55, costPrice: 44, unit: 'pc', minStock: 8, quantity: 24, emoji: '🪥' },
  { id: 'PROD-115', name: 'Surf Excel Bar 150g', nameHindi: 'सर्फ एक्सेल साबुन', category: 'Household Care', sellingPrice: 30, costPrice: 24, unit: 'pc', minStock: 10, quantity: 20, emoji: '🧹' },
  { id: 'PROD-116', name: 'Tata Salt 1kg', nameHindi: 'टाटा नमक १ किलो', category: 'Essentials', sellingPrice: 28, costPrice: 22, unit: 'kg', minStock: 15, quantity: 50, emoji: '🧊' },
  { id: 'PROD-117', name: 'Tata Sampann Toor Dal 500g', nameHindi: 'तूर दाल ५०० ग्राम', category: 'Grains & Flour', sellingPrice: 90, costPrice: 75, unit: 'kg', minStock: 8, quantity: 15, emoji: '🫘' },
  { id: 'PROD-118', name: 'Lays Magic Masala 50g', nameHindi: 'लेज चिप्स', category: 'Snacks', sellingPrice: 20, costPrice: 16, unit: 'pc', minStock: 25, quantity: 48, emoji: '🥔' },
  { id: 'PROD-119', name: 'Parle-G Small Pack', nameHindi: 'पारले-जी छोटा', category: 'Snacks', sellingPrice: 10, costPrice: 8, unit: 'pc', minStock: 30, quantity: 50, emoji: '🍪' },
  { id: 'PROD-120', name: 'Cadbury Dairy Milk 12g', nameHindi: 'डेयरी मिल्क', category: 'Snacks', sellingPrice: 10, costPrice: 8, unit: 'pc', minStock: 30, quantity: 40, emoji: '🍫' },
  { id: 'PROD-121', name: 'Matchbox Box (Pack of 5)', nameHindi: 'माचिस ५ पैक', category: 'Essentials', sellingPrice: 5, costPrice: 4, unit: 'pc', minStock: 40, quantity: 80, emoji: '🔥' }
];

const DEMO_CUSTOMERS_SPEC = [
  // High Value Customers (5) - Total Spend: ₹1,350
  { id: 'CUST-1001', name: 'Rajesh Sharma', phone: '+91 98765 43201', city: 'Indiranagar 2nd Stage', targetSpend: 310, credit: 0, daysAgo: 2, txParts: [110, 100, 100], preferredMethod: 'upi' },
  { id: 'CUST-1002', name: 'Priya Patel', phone: '+91 98765 43202', city: 'Koramangala 4th Block', targetSpend: 280, credit: 80, daysAgo: 1, txParts: [100, 100, 80], preferredMethod: 'upi' },
  { id: 'CUST-1003', name: 'Sunita Verma', phone: '+91 98765 43203', city: 'Jayanagar 7th Block', targetSpend: 250, credit: 0, daysAgo: 3, txParts: [90, 80, 80], preferredMethod: 'cash' },
  { id: 'CUST-1004', name: 'Amit Gupta', phone: '+91 98765 43204', city: 'Andheri West Link Rd', targetSpend: 260, credit: 120, daysAgo: 2, txParts: [120, 70, 70], preferredMethod: 'udhaar' },
  { id: 'CUST-1005', name: 'Suresh Nair', phone: '+91 98765 43215', city: 'Bandra West Hill Rd', targetSpend: 250, credit: 100, daysAgo: 1, txParts: [100, 80, 70], preferredMethod: 'upi' },

  // Regular Customers (10) - Total Spend: ₹1,450
  { id: 'CUST-1006', name: 'Deepak Kumar', phone: '+91 98765 43205', city: 'Karol Bagh Central', targetSpend: 160, credit: 0, daysAgo: 4, txParts: [80, 80], preferredMethod: 'cash' },
  { id: 'CUST-1007', name: 'Ananya Iyer', phone: '+91 98765 43206', city: 'Malleshwaram 15th Cross', targetSpend: 155, credit: 0, daysAgo: 3, txParts: [80, 75], preferredMethod: 'upi' },
  { id: 'CUST-1008', name: 'Vikram Singh', phone: '+91 98765 43207', city: 'Sector 18 Market', targetSpend: 150, credit: 50, daysAgo: 5, txParts: [100, 50], preferredMethod: 'cash' },
  { id: 'CUST-1009', name: 'Sneha Rao', phone: '+91 98765 43208', city: 'Whitefield Palm Meadows', targetSpend: 145, credit: 0, daysAgo: 4, txParts: [75, 70], preferredMethod: 'upi' },
  { id: 'CUST-1010', name: 'Ramesh Mehta', phone: '+91 98765 43209', city: 'Banjara Hills Rd No 12', targetSpend: 150, credit: 70, daysAgo: 6, txParts: [80, 70], preferredMethod: 'udhaar' },
  { id: 'CUST-1011', name: 'Pooja Nair', phone: '+91 98765 43210', city: 'T. Nagar North Usman Rd', targetSpend: 140, credit: 0, daysAgo: 5, txParts: [70, 70], preferredMethod: 'upi' },
  { id: 'CUST-1012', name: 'Manoj Joshi', phone: '+91 98765 43211', city: 'Salt Lake Sector 1', targetSpend: 135, credit: 40, daysAgo: 7, txParts: [70, 65], preferredMethod: 'cash' },
  { id: 'CUST-1013', name: 'Kavita Reddy', phone: '+91 98765 43212', city: 'HSR Layout Sector 2', targetSpend: 145, credit: 0, daysAgo: 3, txParts: [75, 70], preferredMethod: 'upi' },
  { id: 'CUST-1014', name: 'Sanjay Chauhan', phone: '+91 98765 43213', city: 'Vastrapur Lake View', targetSpend: 140, credit: 60, daysAgo: 8, txParts: [80, 60], preferredMethod: 'udhaar' },
  { id: 'CUST-1015', name: 'Neha Kapoor', phone: '+91 98765 43214', city: 'Dwarka Sector 11', targetSpend: 130, credit: 0, daysAgo: 6, txParts: [70, 60], preferredMethod: 'cash' },

  // New Customers (5) - Total Spend: ₹350
  { id: 'CUST-1016', name: 'Harish Bhat', phone: '+91 98765 43221', city: 'Viman Nagar Symbiosis Rd', targetSpend: 75, credit: 0, daysAgo: 2, txParts: [75], preferredMethod: 'upi' },
  { id: 'CUST-1017', name: 'Shweta Kulkarni', phone: '+91 98765 43222', city: 'Shivaji Nagar FC Rd', targetSpend: 80, credit: 0, daysAgo: 4, txParts: [80], preferredMethod: 'cash' },
  { id: 'CUST-1018', name: 'Nitin Aggarwal', phone: '+91 98765 43223', city: 'Rohini Sector 7', targetSpend: 65, credit: 0, daysAgo: 1, txParts: [65], preferredMethod: 'upi' },
  { id: 'CUST-1019', name: 'Preeti Pillai', phone: '+91 98765 43224', city: 'Anna Nagar 2nd Ave', targetSpend: 70, credit: 30, daysAgo: 3, txParts: [70], preferredMethod: 'udhaar' },
  { id: 'CUST-1020', name: 'Meena Agarwal', phone: '+91 98765 43216', city: 'Powai Hiranandani', targetSpend: 60, credit: 0, daysAgo: 5, txParts: [60], preferredMethod: 'cash' },

  // At Risk Customers (5) - Total Spend: ₹500
  { id: 'CUST-1021', name: 'Arvind Swamy', phone: '+91 98765 43217', city: 'Alwarpet TTK Rd', targetSpend: 110, credit: 40, daysAgo: 18, txParts: [60, 50], preferredMethod: 'cash' },
  { id: 'CUST-1022', name: 'Divya Deshmukh', phone: '+91 98765 43218', city: 'Kothrud Paud Rd', targetSpend: 95, credit: 0, daysAgo: 22, txParts: [50, 45], preferredMethod: 'upi' },
  { id: 'CUST-1023', name: 'Alok Tiwari', phone: '+91 98765 43219', city: 'Gomti Nagar Vibhuti Khand', targetSpend: 105, credit: 50, daysAgo: 20, txParts: [55, 50], preferredMethod: 'udhaar' },
  { id: 'CUST-1024', name: 'Ashok Yadav', phone: '+91 98765 43225', city: 'Park Street Camac Rd', targetSpend: 95, credit: 40, daysAgo: 25, txParts: [55, 40], preferredMethod: 'cash' },
  { id: 'CUST-1025', name: 'Rekha Menon', phone: '+91 98765 43226', city: 'Adyar Gandhi Nagar', targetSpend: 95, credit: 0, daysAgo: 28, txParts: [50, 45], preferredMethod: 'upi' },

  // Inactive Customers (5) - Total Spend: ₹350
  { id: 'CUST-1026', name: 'Ritu Saxena', phone: '+91 98765 43220', city: 'Hazratganj Main Market', targetSpend: 70, credit: 0, daysAgo: 50, txParts: [70], preferredMethod: 'cash' },
  { id: 'CUST-1027', name: 'Gaurav Trivedi', phone: '+91 98765 43227', city: 'Navrangpura CG Rd', targetSpend: 80, credit: 60, daysAgo: 52, txParts: [80], preferredMethod: 'udhaar' },
  { id: 'CUST-1028', name: 'Swati Nambiar', phone: '+91 98765 43228', city: 'Jubilee Hills Checkpost', targetSpend: 65, credit: 0, daysAgo: 60, txParts: [65], preferredMethod: 'upi' },
  { id: 'CUST-1029', name: 'Tarun Mathur', phone: '+91 98765 43229', city: 'Civil Lines Station Rd', targetSpend: 65, credit: 30, daysAgo: 65, txParts: [65], preferredMethod: 'udhaar' },
  { id: 'CUST-1030', name: 'Vandana Jain', phone: '+91 98765 43230', city: 'Thane West Ghodbunder Rd', targetSpend: 70, credit: 0, daysAgo: 70, txParts: [70], preferredMethod: 'cash' }
];

function findItemsForAmount(target) {
  function search(remaining, startIdx) {
    if (remaining === 0) return [];
    if (remaining < 0 || startIdx >= DEMO_PRODUCTS.length) return null;

    const prod = DEMO_PRODUCTS[startIdx];
    for (let qty = Math.min(3, Math.floor(remaining / prod.sellingPrice)); qty >= 1; qty--) {
      const cost = qty * prod.sellingPrice;
      const sub = search(remaining - cost, startIdx + 1);
      if (sub !== null) {
        return [{
          productId: prod.id,
          name: prod.name,
          qty,
          price: prod.sellingPrice,
          costPrice: prod.costPrice,
          category: prod.category
        }, ...sub];
      }
    }
    return search(remaining, startIdx + 1);
  }

  return search(target, 0);
}

/**
 * Generate full synchronized dataset for a shopId.
 * Total aggregate sales revenue = EXACTLY ₹4,000 across 30 customers.
 */
function generateDemoDataset(shopId) {
  const now = new Date();
  const products = DEMO_PRODUCTS.map(p => ({ ...p, shopId, isDemo: false }));
  const sales = [];
  const customers = [];
  const payments = [];

  let saleCounter = 1;
  let payCounter = 1;

  DEMO_CUSTOMERS_SPEC.forEach(cm => {
    let customerTotalSpent = 0;
    let latestTxDate = null;
    let remainingCustomerCredit = cm.credit;
    
    cm.txParts.forEach((amt, tIndex) => {
      const items = findItemsForAmount(amt);
      if (!items) throw new Error(`Could not find items for CUST ${cm.id} amt ${amt}`);
      const daysOffset = cm.daysAgo + tIndex * 3;
      const txDate = new Date(now.getTime() - daysOffset * 24 * 60 * 60 * 1000);
      txDate.setHours(10 + tIndex * 3, 15 * tIndex, 0, 0);

      if (!latestTxDate || txDate > latestTxDate) {
        latestTxDate = txDate;
      }

      customerTotalSpent += amt;
      const saleId = `SALE-10${String(saleCounter++).padStart(3, '0')}`;
      
      // Determine credit vs paid portion for this bill
      let txCredit = 0;
      let txPaid = amt;
      if (remainingCustomerCredit >= amt) {
        txCredit = amt;
        txPaid = 0;
        remainingCustomerCredit -= amt;
      } else if (remainingCustomerCredit > 0) {
        txCredit = remainingCustomerCredit;
        txPaid = amt - remainingCustomerCredit;
        remainingCustomerCredit = 0;
      }

      const method = txCredit === amt ? 'udhaar' : (cm.preferredMethod || 'upi');

      const saleRecord = {
        id: saleId,
        shopId,
        customerId: cm.id,
        customerName: cm.name,
        amount: amt,
        method,
        items,
        timestamp: txDate,
        isDemo: false
      };
      sales.push(saleRecord);

      // Create linked payment record
      const payRef = `ANT-PAY-98${String(payCounter++).padStart(4, '0')}`;
      const payStatus = txCredit === 0 ? 'Paid' : (txPaid > 0 ? 'Partially Paid' : 'Pending');
      const payMethod = method === 'udhaar' ? 'cash' : method;

      payments.push({
        id: `PAY-${payRef}`,
        shopId,
        customerId: cm.id,
        customerName: cm.name,
        customerPhone: cm.phone,
        amount: amt,
        amountPaid: txPaid,
        balanceRemaining: txCredit,
        paymentMethod: payMethod,
        status: payStatus,
        referenceNo: payRef,
        upiTransactionRef: payMethod === 'upi' ? `UPI${Date.now().toString().slice(-6)}${payCounter}` : '',
        saleId,
        notes: payStatus === 'Paid' 
          ? `Full payment verified via ${payMethod.toUpperCase()}`
          : payStatus === 'Partially Paid'
            ? `Partially paid ₹${txPaid} via ${payMethod.toUpperCase()}; ₹${txCredit} balance due`
            : `Credit purchase of ₹${amt} pending payment`,
        auditTrail: [{
          status: payStatus,
          updatedBy: 'Store System',
          note: payStatus === 'Paid' ? `Verified payment of ₹${amt}` : `Credit recorded: ₹${txCredit} pending`,
          timestamp: txDate
        }],
        verifiedAt: payStatus === 'Paid' ? txDate : null,
        timestamp: txDate
      });
    });

    const daysSinceLastVisit = latestTxDate ? Math.floor((now - latestTxDate) / (1000 * 60 * 60 * 24)) : 999;
    let segment = 'Regular';
    let status = daysSinceLastVisit <= 30 ? 'Active' : 'Inactive';
    if (daysSinceLastVisit > 45) {
      segment = 'Inactive';
      status = 'Inactive';
    } else if (daysSinceLastVisit > 15) {
      segment = 'At Risk';
      status = 'Active';
    } else if (cm.txParts.length <= 1 && daysSinceLastVisit <= 14) {
      segment = 'New';
      status = 'Active';
    } else if (customerTotalSpent >= 250) {
      segment = 'High Value';
      status = 'Active';
    } else {
      segment = 'Regular';
      status = 'Active';
    }

    const amountPaid = customerTotalSpent - cm.credit;
    const paymentStatus = cm.credit === 0 ? 'Paid' : (amountPaid > 0 ? 'Partially Paid' : 'Pending');

    customers.push({
      id: cm.id,
      shopId,
      name: cm.name,
      phone: cm.phone,
      city: cm.city,
      totalSpent: customerTotalSpent,
      amountPaid,
      totalCredit: cm.credit,
      totalTransactions: cm.txParts.length,
      averageOrderValue: Math.round(customerTotalSpent / cm.txParts.length),
      customerType: segment,
      status,
      paymentStatus,
      lastVisit: latestTxDate,
      isDemo: false
    });
  });

  sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  payments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const expenses = [
    { id: 'EXP-101', shopId, amount: 800, category: 'Shop Rent', note: 'Monthly Shop Rent Allocation', month: 'April 2026', date: '2026-04-01', timestamp: new Date('2026-04-01T10:00:00Z'), isDemo: false },
    { id: 'EXP-102', shopId, amount: 250, category: 'Electricity & Utilities', note: 'Commercial Power Bill', month: 'April 2026', date: '2026-04-05', timestamp: new Date('2026-04-05T11:30:00Z'), isDemo: false },
    { id: 'EXP-103', shopId, amount: 1500, category: 'Wholesale Stock Restock', note: 'Bulk FMCG restock', month: 'April 2026', date: '2026-04-10', timestamp: new Date('2026-04-10T09:00:00Z'), isDemo: false },
    { id: 'EXP-104', shopId, amount: 120, category: 'Packaging & Bags', note: 'Carry bags order', month: 'April 2026', date: '2026-04-14', timestamp: new Date('2026-04-14T14:20:00Z'), isDemo: false },
    { id: 'EXP-105', shopId, amount: 180, category: 'Local Transport & Tempo', note: 'Distributor delivery tempo charges', month: 'April 2026', date: '2026-04-18', timestamp: new Date('2026-04-18T16:00:00Z'), isDemo: false }
  ];

  return { products, customers, sales, payments, expenses };
}

module.exports = {
  DEMO_PRODUCTS,
  DEMO_CUSTOMERS_META: DEMO_CUSTOMERS_SPEC,
  generateDemoDataset
};
