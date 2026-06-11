const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function relayOrderToPetpooja(orderData) {
  try {
    console.log(`🚀 Relaying Order ${orderData.id} to Petpooja...`);
    console.log(`🔗 Callback URL being sent: ${process.env.BASE_URL || 'https://fitgrrenbackend2.onrender.com'}/api/petpooja/order-status`);

    // Aggregated tax details for order level
    const taxMap = {};
    orderData.items.forEach(item => {
      const addonPriceTotal = (item.addon_items || item.addons || []).reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);
      const basePrice = parseFloat(item.price) || 0;
      const combinedPrice = basePrice + addonPriceTotal;
      
      const itemSubtotal = combinedPrice * (item.quantity || 1);
      const itemDiscount = parseFloat(item.discount_total || item.discount || 0);
      const taxableAmount = itemSubtotal - itemDiscount;

      (item.item_tax || item.taxes || []).forEach(t => {
        const id = t.id || t.tax_id;
        if (!taxMap[id]) {
          taxMap[id] = {
            id: id,
            title: t.name || t.tax_title || (id === "1902" ? "SGST" : "CGST"),
            type: "P",
            price: t.tax_percentage || "2.5",
            tax: 0,
            restaurant_liable_amt: 0
          };
        }
        taxMap[id].tax += parseFloat(t.amount || t.tax_amount || 0);
        taxMap[id].restaurant_liable_amt += parseFloat(t.amount || t.tax_amount || 0);
      });
    });

    const tax_details = Object.values(taxMap).map(t => ({
      ...t,
      tax: t.tax.toFixed(2),
      restaurant_liable_amt: t.restaurant_liable_amt.toFixed(2)
    }));

    const now = new Date();
    const dateOnly = now.toISOString().split('T')[0];
    const timeOnly = now.toTimeString().split(' ')[0];

    // Prepare Save Order payload for Petpooja (V11 Refined Schema)
    const petpoojaPayload = {
      app_key: process.env.PETPOOJA_APP_KEY,
      app_secret: process.env.PETPOOJA_APP_SECRET,
      access_token: process.env.PETPOOJA_ACCESS_TOKEN,
      restID: 'f871uxkp',
      orderinfo: {
        OrderInfo: {
          Restaurant: {
            details: {
              res_name: "FitGreen",
              address: "Ahmedabad",
              contact_information: "9999999999",
              restID: "f871uxkp"
            }
          },
          Customer: {
            details: {
              name: orderData.customerName || 'Customer',
              email: orderData.customerEmail || '',
              phone: orderData.phone || '9999999999',
              address: orderData.address || 'N/A'
            }
          },
          Order: {
            details: {
              orderID: orderData.id || `FG${Date.now()}`,
              clientOrderID: orderData.id,
              preorder_date: dateOnly,
              preorder_time: timeOnly,
              advanced_order: "N",
              order_type: "H",
              payment_type: "ONLINE",
              total: parseFloat(typeof orderData.total === 'string' ? orderData.total.replace(/[^\d.-]/g, '') : orderData.total).toFixed(2),
              tax_total: (orderData.tax_total || 0).toFixed(2),
              discount_total: (orderData.discount_total || 0).toFixed(2),
              discount_type: "F",
              description: orderData.description || "Real Order via FitGreen",
              created_on: new Date().toISOString().replace('T', ' ').substring(0, 19),
              dc_tax_percentage: "0",
              pc_tax_percentage: "0",
              delivery_charges: "0.00",
              packing_charges: "0.00",
              service_charge: "0.00",
              enable_delivery: 1,
              callback_url: `${process.env.BASE_URL || 'https://fitgrrenbackend2.onrender.com'}/api/petpooja/order-status`
            }
          },
          OrderItem: {
            details: orderData.items.map(item => {
              const addonPriceTotal = (item.addon_items || item.addons || []).reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);
              const basePrice = parseFloat(item.price) || 0;
              const combinedPrice = basePrice + addonPriceTotal;
              const itemDiscount = parseFloat(item.item_discount || item.discount || 0);
              
              const addonsList = (item.addon_items || item.addons || []).map(a => ({
                id: a.id || a.addonId,
                name: a.name,
                group_name: a.group_name || a.groupName || "",
                group_id: a.group_id || a.groupId || "",
                price: (parseFloat(a.price) || 0).toFixed(2),
                quantity: a.quantity || a.qty || 1
              }));

              const orderItemObj = {
                id: item.itemId || item.id,
                name: item.name,
                tax_inclusive: false,
                item_discount: itemDiscount.toFixed(2),
                price: combinedPrice.toFixed(2),
                final_price: (combinedPrice - itemDiscount).toFixed(2),
                quantity: item.quantity || 1,
                gst_liability: "restaurant",
                variation_id: item.variation_id || item.variantId || "",
                variation_name: item.variation_name || item.variantName || "",
                item_tax: (item.item_tax || item.taxes || []).map(t => ({
                  id: t.id || t.tax_id,
                  name: t.name || t.tax_title,
                  tax_percentage: t.tax_percentage || "",
                  amount: (t.amount || t.tax_amount || 0).toFixed(2)
                }))
              };

              if (addonsList.length > 0) {
                orderItemObj.AddonItem = { details: addonsList };
              }

              return orderItemObj;
            })
          },
          Tax: {
            details: tax_details
          }
        }
      }
    };

    const saveOrderUrl = process.env.PETPOOJA_SAVE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';
    
    let axiosConfig = {};
    if (process.env.PROXY_URL) {
      console.log('🔒 Routing Petpooja relay request through static proxy...');
      const agent = new HttpsProxyAgent(process.env.PROXY_URL);
      axiosConfig = {
        httpsAgent: agent,
        httpAgent: agent,
        proxy: false
      };
    }

    console.log('📡 Sending Payload to Petpooja:', JSON.stringify(petpoojaPayload, null, 2));
    const petpoojaRes = await axios.post(saveOrderUrl, petpoojaPayload, axiosConfig);
    console.log('✅ Petpooja Relay Response:', petpoojaRes.data);
    return petpoojaRes.data;
  } catch (error) {
    console.error('❌ Petpooja Relay Failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = { relayOrderToPetpooja };
