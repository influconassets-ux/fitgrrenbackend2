const axios = require('axios');
require('dotenv').config();
const fs = require('fs');

const PETPOOJA_APP_KEY = process.env.PETPOOJA_APP_KEY;
const PETPOOJA_APP_SECRET = process.env.PETPOOJA_APP_SECRET;
const PETPOOJA_ACCESS_TOKEN = process.env.PETPOOJA_ACCESS_TOKEN;
const SAVE_ORDER_URL = process.env.PETPOOJA_SAVE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';

async function pushScenario3() {
    const dateOnly = "2026-05-15";
    const timeOnly = "00:50:00"; 
    const createdOn = `${dateOnly} ${timeOnly}`;
    const orderID = `FITGREEN-TEST-403`;

    const payload = {
        "app_key": PETPOOJA_APP_KEY,
        "app_secret": PETPOOJA_APP_SECRET,
        "access_token": PETPOOJA_ACCESS_TOKEN,
        "restID": "f871uxkp",
        "enable_delivery": "1",
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
                        "name": "Test User",
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
                        "total": "483.00",
                        "tax_total": "23.00",
                        "discount_total": "0.00",
                        "discount_type": "F",
                        "description": "Scenario 3 - Item with Variation + Tax",
                        "created_on": createdOn,
                        "dc_tax_percentage": "0",
                        "pc_tax_percentage": "0",
                        "delivery_charges": "0.00",
                        "packing_charges": "0.00",
                        "service_charge": "0.00",
                        "enable_delivery": "1",
                        "callback_url": "https://fitgreen-backend.onrender.com/api/petpooja/order-status"
                    }
                },
                "OrderItem": {
                    "details": [
                        {
                            "id": "10451241",
                            "name": "Veg Thai Curry",
                            "tax_inclusive": false,
                            "item_discount": "0.00",
                            "price": "460.00",
                            "final_price": "460.00",
                            "quantity": "1",
                            "gst_liability": "restaurant",
                            "variation_id": "6779",
                            "variation_name": "With Rice",
                            "item_tax": [
                                { "id": "1902", "name": "SGST", "tax_percentage": "2.5", "amount": "11.50" },
                                { "id": "1903", "name": "CGST", "tax_percentage": "2.5", "amount": "11.50" }
                            ],
                            "AddonItem": {
                                "details": []
                            }
                        }
                    ]
                },
                "Tax": {
                    "details": [
                        { "id": "1902", "title": "SGST", "type": "P", "price": "2.5", "tax": "11.50", "restaurant_liable_amt": "11.50" },
                        { "id": "1903", "title": "CGST", "type": "P", "price": "2.5", "tax": "11.50", "restaurant_liable_amt": "11.50" }
                    ]
                }
            }
        }
    };

    console.log(`🚀 Executing Scenario 3 (Variation Test: ${orderID})...`);
    try {
        const response = await axios.post(SAVE_ORDER_URL, payload);
        console.log(`✅ Response:`, JSON.stringify(response.data));
        
        fs.writeFileSync('scenario3_request.json', JSON.stringify(payload, null, 2));
        fs.writeFileSync('scenario3_response.json', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error(`❌ Failed:`, error.response ? error.response.data : error.message);
    }
}

pushScenario3();
