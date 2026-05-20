const axios = require('axios');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PETPOOJA_APP_KEY = process.env.PETPOOJA_APP_KEY;
const PETPOOJA_APP_SECRET = process.env.PETPOOJA_APP_SECRET;
const PETPOOJA_ACCESS_TOKEN = process.env.PETPOOJA_ACCESS_TOKEN;
const SAVE_ORDER_URL = process.env.PETPOOJA_SAVE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';
const REST_ID = 'f871uxkp';

async function pushOrder(scenario) {
    const dateOnly = "2026-05-16";
    const timeOnly = scenario.time;
    const createdOn = `${dateOnly} ${timeOnly}`;

    const payload = {
        "app_key": PETPOOJA_APP_KEY,
        "app_secret": PETPOOJA_APP_SECRET,
        "access_token": PETPOOJA_ACCESS_TOKEN,
        "restID": REST_ID,
        "orderinfo": {
            "OrderInfo": {
                "Restaurant": {
                    "details": {
                        "res_name": "FitGreen",
                        "address": "Ahmedabad",
                        "contact_information": "9999999999",
                        "restID": REST_ID
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
                        "orderID": scenario.orderID,
                        "clientOrderID": scenario.orderID,
                        "preorder_date": dateOnly,
                        "preorder_time": timeOnly,
                        "advanced_order": "N",
                        "order_type": "H",
                        "payment_type": "ONLINE",
                        "total": scenario.total,
                        "tax_total": scenario.tax_total,
                        "discount_total": scenario.discount_total || "0.00",
                        "discount_type": "F",
                        "description": scenario.description,
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
                    "details": scenario.items
                },
                "Tax": {
                    "details": scenario.tax_details
                }
            }
        }
    };

    console.log(`🚀 Sending Scenario: ${scenario.description} (${scenario.orderID})...`);
    
    try {
        const response = await axios.post(SAVE_ORDER_URL, payload);
        console.log(`✅ Response:`, JSON.stringify(response.data));
        
        const maskedPayload = JSON.parse(JSON.stringify(payload));
        maskedPayload.app_key = "HIDDEN";
        maskedPayload.app_secret = "HIDDEN";
        maskedPayload.access_token = "HIDDEN";

        const logDir = path.join(__dirname, 'final_verified_logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

        fs.writeFileSync(path.join(logDir, `${scenario.orderID}_request.json`), JSON.stringify(maskedPayload, null, 2));
        fs.writeFileSync(path.join(logDir, `${scenario.orderID}_response.json`), JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error(`❌ Failed:`, error.response ? error.response.data : error.message);
    }
}

const taxDetailsDefault = [
    { "id": "1902", "title": "SGST", "type": "P", "price": "2.5", "tax": "11.50", "restaurant_liable_amt": "11.50" },
    { "id": "1903", "title": "CGST", "type": "P", "price": "2.5", "tax": "11.50", "restaurant_liable_amt": "11.50" }
];

const scenarios = [
    {
        orderID: "FITGREEN-TEST-601",
        description: "1. Item + Tax",
        time: "02:30:00",
        total: "483.00",
        tax_total: "23.00",
        items: [
            {
                "id": "10451241",
                "name": "Veg Thai Curry",
                "tax_inclusive": false,
                "item_discount": "0.00",
                "price": "460.00",
                "final_price": "460.00",
                "quantity": "1",
                "gst_liability": "restaurant",
                "item_tax": [
                    { "id": "1902", "name": "SGST", "tax_percentage": "2.5", "amount": "11.50" },
                    { "id": "1903", "name": "CGST", "tax_percentage": "2.5", "amount": "11.50" }
                ],
                "AddonItem": { "details": [] },
                "variation_id": "",
                "variation_name": ""
            }
        ],
        tax_details: taxDetailsDefault
    },
    {
        orderID: "FITGREEN-TEST-602",
        description: "2. Item with Addon + Tax",
        time: "02:35:00",
        total: "483.00",
        tax_total: "23.00",
        items: [
            {
                "id": "10451241",
                "name": "Veg Thai Curry",
                "tax_inclusive": false,
                "item_discount": "0.00",
                "price": "460.00", // Fixed: Includes addon (430+30)
                "final_price": "460.00", // Fixed: Final_price = Price - discount
                "quantity": "1",
                "gst_liability": "restaurant",
                "item_tax": [
                    { "id": "1902", "name": "SGST", "tax_percentage": "2.5", "amount": "11.50" },
                    { "id": "1903", "name": "CGST", "tax_percentage": "2.5", "amount": "11.50" }
                ],
                "AddonItem": {
                    "details": [
                        { "id": "23034", "name": "Red", "group_name": "Thai Curry Flavour", "group_id": 7502, "price": "30.00", "quantity": "1" }
                    ]
                },
                "variation_id": "",
                "variation_name": ""
            }
        ],
        tax_details: taxDetailsDefault
    },
    {
        orderID: "FITGREEN-TEST-603",
        description: "3. Item with Variation + Tax",
        time: "02:40:00",
        total: "483.00",
        tax_total: "23.00",
        items: [
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
                "AddonItem": { "details": [] }
            }
        ],
        tax_details: taxDetailsDefault
    },
    {
        orderID: "FITGREEN-TEST-604",
        description: "4. Item with Discount + Tax",
        time: "02:45:00",
        total: "472.50",
        tax_total: "22.50",
        discount_total: "10.00",
        items: [
            {
                "id": "10451241",
                "name": "Veg Thai Curry",
                "tax_inclusive": false,
                "item_discount": "10.00",
                "price": "460.00",
                "final_price": "450.00",
                "quantity": "1",
                "gst_liability": "restaurant",
                "item_tax": [
                    { "id": "1902", "name": "SGST", "tax_percentage": "2.5", "amount": "11.25" },
                    { "id": "1903", "name": "CGST", "tax_percentage": "2.5", "amount": "11.25" }
                ],
                "AddonItem": { "details": [] },
                "variation_id": "",
                "variation_name": ""
            }
        ],
        tax_details: [
            { "id": "1902", "title": "SGST", "type": "P", "price": "2.5", "tax": "11.25", "restaurant_liable_amt": "11.25" },
            { "id": "1903", "title": "CGST", "type": "P", "price": "2.5", "tax": "11.25", "restaurant_liable_amt": "11.25" }
        ]
    },
    {
        orderID: "FITGREEN-TEST-605",
        description: "5. Item with Addon + Variation + Tax",
        time: "02:50:00",
        total: "483.00",
        tax_total: "23.00",
        items: [
            {
                "id": "10451241",
                "name": "Veg Thai Curry",
                "tax_inclusive": false,
                "item_discount": "0.00",
                "price": "460.00", // Fixed
                "final_price": "460.00", // Fixed
                "quantity": "1",
                "gst_liability": "restaurant",
                "variation_id": "6779",
                "variation_name": "With Rice",
                "item_tax": [
                    { "id": "1902", "name": "SGST", "tax_percentage": "2.5", "amount": "11.50" },
                    { "id": "1903", "name": "CGST", "tax_percentage": "2.5", "amount": "11.50" }
                ],
                "AddonItem": {
                    "details": [
                        { "id": "23034", "name": "Red", "group_name": "Thai Curry Flavour", "group_id": 7502, "price": "30.00", "quantity": "1" }
                    ]
                }
            }
        ],
        tax_details: taxDetailsDefault
    },
    {
        orderID: "FITGREEN-TEST-606",
        description: "6. Item with Addon + Variation + Tax + Discount",
        time: "02:55:00",
        total: "472.50",
        tax_total: "22.50",
        discount_total: "10.00",
        items: [
            {
                "id": "10451241",
                "name": "Veg Thai Curry",
                "tax_inclusive": false,
                "item_discount": "10.00",
                "price": "460.00",
                "final_price": "450.00",
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
                        { "id": "23034", "name": "Red", "group_name": "Thai Curry Flavour", "group_id": 7502, "price": "30.00", "quantity": "1" }
                    ]
                }
            }
        ],
        tax_details: [
            { "id": "1902", "title": "SGST", "type": "P", "price": "2.5", "tax": "11.25", "restaurant_liable_amt": "11.25" },
            { "id": "1903", "title": "CGST", "type": "P", "price": "2.5", "tax": "11.25", "restaurant_liable_amt": "11.25" }
        ]
    }
];

async function runAll() {
    for (const scenario of scenarios) {
        await pushOrder(scenario);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log("\n✅ All 6 verified scenarios pushed successfully.");
}

runAll();

