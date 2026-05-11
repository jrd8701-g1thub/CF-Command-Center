import streamlit as st
import gspread
from google.oauth2.service_account import Credentials
import pandas as pd
import datetime

# 🛰️ MASTER CONNECTION
scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
creds = Credentials.from_service_account_info(st.secrets["gcp_service_account"], scopes=scope)
client = gspread.authorize(creds)

# 🔗 DYNAMIC LINK (Using your unique ID for stability)
SHEET_ID = "15AOU_ur7mWhnoAFmf_qOVQ87OaXb36W8z4FbPgbxK60"
sheet = client.open_by_key(SHEET_ID)

# 🎨 UI CONFIGURATION
st.set_page_config(page_title="C&F Command Center", layout="wide", initial_sidebar_state="expanded")

# 📂 LOAD DATA FROM GOOGLE SHEETS
control_data = sheet.worksheet("POS System Control").get_all_values()
config = {row[0]: row[1] for row in control_data if len(row) > 1}

# 🛠️ STYLING (The "Antigravity" Look)
st.markdown("""
    <style>
    [data-testid="stSidebar"] { background-color: #0e1117; border-right: 1px solid #262730; }
    .stMetric { background-color: #161b22; padding: 15px; border-radius: 10px; border: 1px solid #30363d; }
    </style>
""", unsafe_allow_html=True)

# 📟 SIDEBAR NAVIGATION
with st.sidebar:
    st.image("https://cdn-icons-png.flaticon.com/512/3063/3063822.png", width=80)
    st.title("Command Center")
    st.caption("POINT OF SALE")
    menu = st.radio("Navigation", ["🕒 TimeKeeper", "📟 POS Terminal", "🚚 Delivery", "📊 Production", "⚙️ Settings"])
    st.divider()
    admin_pin = st.text_input("Admin System", type="password", placeholder="Enter PIN")

# 🕒 TIMEKEEPER HUB (Matching your 2nd screenshot)
if menu == "🕒 TimeKeeper":
    st.header("🕒 TimeKeeper Hub")
    st.caption("STAFF ATTENDANCE & EXPENSE LOGGING")
    
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("ON SHIFT", "0", "active")
    with col2:
        st.metric("OFF SHIFT", "0")
    with col3:
        st.metric("TOTAL STAFF", "0")
        
    st.subheader("Currently On Shift")
    st.info("No staff currently on shift.")
    
    st.subheader("Off Shift")
    st.write("All staff are currently on shift.")

# 📟 POS TERMINAL (Logic from image_eb0d7a.jpg)
elif menu == "📟 POS Terminal":
    st.header("📟 POS Terminal")
    # ... (Your product selection and logic goes here)
    st.success("POS System is synced with Google Sheets")

# 🛡️ SECURITY OVERRIDE
if admin_pin == config.get("Admin PIN", "615007"):
    st.sidebar.success("ADMIN ONLINE")