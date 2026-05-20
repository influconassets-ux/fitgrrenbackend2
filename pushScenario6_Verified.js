const axios = require('axios');
require('dotenv').config();
const fs = require('fs');

const PETPOOJA_APP_KEY = process.env.PETPOOJA_APP_KEY;
const PETPOOJA_APP_SECRET = process.env.PETPOOJA_APP_SECRET;
const PETPOOJA_ACCESS_TOKEN = process.env.PETPOOJA_ACCESS_TOKEN;
const SAVE_ORDER_URL = process.env.PETPOOJA_SAVE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';

async function pushScenario6() {
    const dateOnly = new Date().toISOString().split('T')[0]; // Current date
    const timeOnly = "12:30:00";
    const createdOn = `${dateOnly} ${timeOnly}`;
    const orderID = `FITGREEN-VERIFIED-${Date.now()}`;

    // Calculation:
    // Base Price (with Variation): 430.00
    // Addon Price: 30.00
    // Total Unit Price (Price): 460.00
    // Item Discount: 10.00
    // Final Price (Final_price): 460.00 - 10.00 = 450.00
    // Quantity: 1
    // Tax (5% on 450.00): 22.50 (SGST: 11.25, CGST: 11.25)
    // Total: 450.00 + 22.50 = 472.50

    const payload = {
        "app_key": PETPOOJA_APP_KEY,
        "app_secret": PETPOOJA_APP_SECRET,
        "access_token": PETPOOJA_ACCESS_TOKEN,
        "restID": "f871uxkp",
        "orderinfo": {
            "OrderInfo": {
                "Restaurant": {
                    "details": {
                        "res_name": "FitGreen",
                        "address": "Ahmedabad",
                        "contact_information": "9999999999",
                        "restID": "f871uxkp"
                    }
                },
                "Customer": {
                    "details": {
                        "name": "Verified Tester",
                        "email": "test@example.com",
                        "phone": "9999999999",
                        "address": "Test Address, Ahmedabad"
                    }
                },
                "Order": {
                    "details": {
                        "orderID": orderID,
                        "clientOrderID": orderID,
                        "preorder_date": dateOnly,
                        "preorder_time": timeOnly,
                        "advanced_order": "N",
                        "order_type": "H",
                        "payment_type": "ONLINE",
                        "total": "472.50", // 450.00 (subtotal) + 22.50 (tax)
                        "tax_total": "22.50",
                        "discount_total": "10.00",
                        "discount_type": "F",
                        "description": "Verified Scenario: Item with Addon and Variation + Tax + Discount",
                        "created_on": createdOn,
                        "dc_tax_percentage": "0",
                        "pc_tax_percentage": "0",
                        "delivery_charges": "0.00",
                        "packing_charges": "0.00",
                        "service_charge": "0.00",
                        "enable_delivery": 1, // Moved here as Integer to enable "Dispatched" button
                        "callback_url": "https://fitgreen-backend.onrender.com/api/petpooja/order-status"
                    }
                },
                "OrderItem": {
                    "details": [
                        {
                            "id": "10451241",
                            "name": "Veg Thai Curry",
                            "tax_inclusive": false,
                            "item_discount": "10.00",
                            "price": "460.00", // Fixed: Reflects single quantity (Base 430 + Addon 30)
                            "final_price": "450.00", // Fixed: Price (460) - item_discount (10)
                            "quantity": "1",
                            "gst_liability": "restaurant",
                            "variation_id": "6779",
                            "variation_name": "With Rice",
                            "item_tax": [
                                { "id": "1902", "name": "SGST", "tax_percentage": "2.5", "amount": "11.25" },
                                { "id": "1903", "name": "CGST", "tax_percentage": "2.5", "amount": "11.25" }
                            ],
                            "AddonItem": {
                                "details": [
                                    {
                                        "id": "23034",
                                        "name": "Red",
                                        "group_name": "Thai Curry Flavour",
                                        "group_id": 7502,
                                        "price": "30.00",
                                        "quantity": "1"
                                    }
                                ]
                            }
                        }
                    ]
                },
                "Tax": {
                    "details": [
                        { "id": "1902", "title": "SGST", "type": "P", "price": "2.5", "tax": "11.25", "restaurant_liable_amt": "11.25" },
                        { "id": "1903", "title": "CGST", "type": "P", "price": "2.5", "tax": "11.25", "restaurant_liable_amt": "11.25" }
                    ]
                }
            }
        }
    };

    console.log(`🚀 Sending Verified Scenario: ${orderID}...`);
    try {
        const response = await axios.post(SAVE_ORDER_URL, payload);
        console.log(`✅ Response:`, JSON.stringify(response.data));
        
        fs.writeFileSync('verified_scenario_request.json', JSON.stringify(payload, null, 2));
        fs.writeFileSync('verified_scenario_response.json', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error(`❌ Failed:`, error.response ? error.response.data : error.message);
    }
}

pushScenario6();
