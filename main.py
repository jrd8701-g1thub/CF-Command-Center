import streamlit as st
import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import re

# 🛰️ MASTER SYSTEM CONNECTION
scope = ["https://www.googleapis.com/auth/spreadsheets"]
creds = Credentials.from_service_account_info(st.secrets["gcp_service_account"], scopes=scope)
client = gspread.authorize(creds)

# 🛑 CORRECTED WORKBOOK NAME (Per Screenshot)
sheet = client.open("C&F Command Center Database")

# 🧠 DYNAMIC CONFIGURATION (Module A: POS System Control)
control_sheet = sheet.worksheet("POS System Control")
data = control_sheet.get_all_values()
# Convert to a dictionary for easy lookups
config = {row[0]: row[1] for row in data if len(row) > 1}

# 🔒 DYNAMIC SECURITY (PIN is now pulled from the Sheet)
MASTER_PIN = str(config.get('Admin PIN', '615007'))

def check_admin():
    admin_pin = st.sidebar.text_input("Enter Admin PIN", type="password")
    return admin_pin == MASTER_PIN

st.title("🛰️ Chill 'n Fill Command Center")

# 🛒 DYNAMIC POS & COMMISSION RULES (Module C)
st.header("🛒 POS Dashboard")

# Get Products/Pricing from Sheet (Assuming a 'Products' tab exists)
# For now, we'll use a placeholder to demonstrate your new rules
products = ["Purified Water (5 Gallon)", "Ice Tube (25kg)", "Ice Tube (5kg)"]
selected_prod = st.selectbox("Select Product", products)
quantity = st.number_input("Quantity", min_value=1, value=1)
is_delivery = st.toggle("Delivery Mode")

# ⚖️ DYNAMIC COMMISSION LOGIC (Per image_eb0d7a.jpg)
def calculate_commission(product_name, qty):
    comm_total = 0
    name_lower = product_name.lower()
    
    # RULE 1: Water Delivery (Fixed Rate)
    if config.get('SKU Keyword — water') in name_lower:
        rate = float(config.get('Value — ₱ amount earned per unit when Type = Fixed', 1))
        comm_total = qty * rate
        
    # RULE 2: Ice Delivery (Weight Based)
    elif config.get('SKU Keyword — ice') in name_lower:
        divisor = float(config.get('Value / Divisor — For Weight type: divide the KG by this number', 25))
        max_cap = float(config.get('Max Cap — Maximum ₱ per unit', 1))
        
        # Extract KG from product name (e.g., "Ice Tube (25kg)")
        kg_match = re.search(r'(\d+)kg', name_lower)
        if kg_match:
            kg_val = float(kg_match.group(1))
            calc_rate = min(kg_val / divisor, max_cap)
            comm_total = qty * calc_rate
            
    return comm_total

if is_delivery:
    total_comm = calculate_commission(selected_prod, quantity)
    st.info(f"Driver Commission: ₱{total_comm:.2f}")
else:
    st.info("Walk-in Sale: No Commission")

# ⚡ DYNAMIC PRODUCTION (Admin Only)
if check_admin():
    st.divider()
    st.header("🛡️ Admin: Anti-Theft Logs")
    # Pull dynamic costs from Sheet
    kw_rate = float(config.get('Electricity_kW', 5.2))
    st.write(f"Current System kW Logic: {kw_rate}kW")
