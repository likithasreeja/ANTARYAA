"""
ANTARYA v6 — Unified Kirana Taxonomy Mapper
============================================
Maps product identifiers from ANY dataset into a unified
kirana product taxonomy. Reusable for future POS data.

Taxonomy:
  DAIRY        → Milk, Curd, Paneer, Cheese, Butter, Ghee
  GROCERY      → Rice, Dal, Atta, Sugar, Salt, Spices, Oil
  PACKAGED_FOOD → Maggi, Noodles, Biscuits, Chips, Namkeen
  BEVERAGES    → Tea, Coffee, Soft Drinks, Juice, Water
  PERSONAL_CARE → Soap, Shampoo, Toothpaste, Cream
  CLEANING     → Detergent, Floor Cleaner, Dish Wash
  PRODUCE      → Vegetables, Fruits
  BAKERY       → Bread, Pav, Cake
  EGGS_MEAT    → Eggs, Chicken, Fish
  FROZEN       → Ice Cream, Frozen Veg
"""

# ──────────────────────────────────────────────────────────
# Indian Retail Chain Mapping
# ──────────────────────────────────────────────────────────
# The Indian Retail Chain dataset has:
#   category_of_product: FMCG, perishable, others
#   department_identifier: 6 departments (int codes)
#   product_identifier: 50 products (int codes)
#
# Since we don't have product names, we map at category + department level.

RETAIL_CHAIN_CATEGORY_MAP = {
    "FMCG": "FMCG",
    "perishable": "PERISHABLE",
    "others": "GENERAL",
}

RETAIL_CHAIN_DEPT_TO_KIRANA = {
    11: "GROCERY",        # department 11
    12: "PERSONAL_CARE",  # department 12
    13: "BEVERAGES",      # department 13
    14: "CLEANING",       # department 14
    15: "DAIRY",          # department 15
    16: "PACKAGED_FOOD",  # department 16
}

# ──────────────────────────────────────────────────────────
# Indian Store Data Mapping
# ──────────────────────────────────────────────────────────
STORE_DATA_CATEGORY_MAP = {
    "Fruits & Vegetables": "PRODUCE",
    "Dairy": "DAIRY",
    "Fast Food": "PACKAGED_FOOD",
    "Household": "CLEANING",
    "Electric Appliances": "GENERAL",
    "Furniture": "GENERAL",
}

STORE_DATA_SUBCAT_MAP = {
    "Burgers": "PACKAGED_FOOD",
    "Pizzas": "PACKAGED_FOOD",
    "Noodles": "PACKAGED_FOOD",
    "Sandwiches": "PACKAGED_FOOD",
    "Wraps": "PACKAGED_FOOD",
    "Momos": "PACKAGED_FOOD",
    "Milk": "DAIRY",
    "Curd": "DAIRY",
    "Paneer": "DAIRY",
    "Butter": "DAIRY",
    "Cheese": "DAIRY",
    "Ghee": "DAIRY",
    "Ice Cream": "FROZEN",
    "Apples": "PRODUCE",
    "Bananas": "PRODUCE",
    "Mangoes": "PRODUCE",
    "Oranges": "PRODUCE",
    "Onions": "PRODUCE",
    "Potatoes": "PRODUCE",
    "Tomatoes": "PRODUCE",
    "Fans": "GENERAL",
    "Lights": "GENERAL",
    "Heaters": "GENERAL",
    "Tables": "GENERAL",
    "Chairs": "GENERAL",
    "Beds": "GENERAL",
}

# ──────────────────────────────────────────────────────────
# AGMARKNET → Kirana Mapping
# ──────────────────────────────────────────────────────────
AGMARKNET_COMMODITY_MAP = {
    "Rice": "GROCERY",
    "Wheat": "GROCERY",
    "Paddy(Dhan)(Common)": "GROCERY",
    "Bengal Gram Dal (Chana Dal)": "GROCERY",
    "Arhar (Tur/Red Gram)(Whole)": "GROCERY",
    "Moong Dal (Whole)": "GROCERY",
    "Urad (Whole)": "GROCERY",
    "Masoor Dal": "GROCERY",
    "Gur(Jaggery)": "GROCERY",
    "Sugar": "GROCERY",
    "Ground Nut Oil": "GROCERY",
    "Sunflower Oil": "GROCERY",
    "Mustard Oil": "GROCERY",
    "Tomato": "PRODUCE",
    "Onion": "PRODUCE",
    "Potato": "PRODUCE",
    "Green Chilli": "PRODUCE",
    "Brinjal": "PRODUCE",
    "Cabbage": "PRODUCE",
    "Cauliflower": "PRODUCE",
    "Banana": "PRODUCE",
    "Apple": "PRODUCE",
    "Mango": "PRODUCE",
    "Grapes": "PRODUCE",
    "Lemon": "PRODUCE",
    "Coconut": "PRODUCE",
    "Ginger(Green)": "PRODUCE",
    "Garlic": "PRODUCE",
    "Turmeric": "GROCERY",
    "Coriander(Leaves)": "PRODUCE",
    "Dry Chillies": "GROCERY",
    "Black Gram (Urd Beans)(Whole)": "GROCERY",
    "Groundnut": "GROCERY",
    "Maize": "GROCERY",
    "Jowar(Sorghum)": "GROCERY",
    "Bajra(Pearl Millet)": "GROCERY",
    "Sesame(Gingelly/Til)": "GROCERY",
}

# ──────────────────────────────────────────────────────────
# Unified Kirana Categories
# ──────────────────────────────────────────────────────────
KIRANA_CATEGORIES = [
    "DAIRY",
    "GROCERY",
    "PACKAGED_FOOD",
    "BEVERAGES",
    "PERSONAL_CARE",
    "CLEANING",
    "PRODUCE",
    "BAKERY",
    "EGGS_MEAT",
    "FROZEN",
    "GENERAL",
    "PERISHABLE",
]


def map_retail_chain(df):
    """Map Indian Retail Chain dataset to kirana taxonomy."""
    df = df.copy()
    df["kirana_category"] = df["department_identifier"].map(RETAIL_CHAIN_DEPT_TO_KIRANA).fillna("GENERAL")
    df["product_type"] = df["category_of_product"].map(RETAIL_CHAIN_CATEGORY_MAP).fillna("GENERAL")
    df["kirana_code"] = df["kirana_category"].astype("category").cat.codes
    return df


def map_store_data(df):
    """Map Indian Store Data to kirana taxonomy."""
    df = df.copy()
    if "Sub-Category" in df.columns:
        df["kirana_category"] = df["Sub-Category"].map(STORE_DATA_SUBCAT_MAP)
    if "Category of Goods" in df.columns:
        unmapped = df["kirana_category"].isnull()
        df.loc[unmapped, "kirana_category"] = df.loc[unmapped, "Category of Goods"].map(STORE_DATA_CATEGORY_MAP)
    df["kirana_category"] = df["kirana_category"].fillna("GENERAL")
    df["kirana_code"] = df["kirana_category"].astype("category").cat.codes
    return df


def map_agmarknet(df):
    """Map AGMARKNET commodities to kirana taxonomy."""
    df = df.copy()
    df["kirana_category"] = df["commodity"].map(AGMARKNET_COMMODITY_MAP).fillna("GENERAL")
    return df


def map_product_to_family(product_name: str, category: str = None) -> str:
    """Map a single product name or category string to a Kirana category family."""
    if category:
        cat_upper = category.upper().replace(" ", "_")
        for k_cat in KIRANA_CATEGORIES:
            if k_cat in cat_upper or cat_upper in k_cat:
                return k_cat
        if category in STORE_DATA_SUBCAT_MAP:
            return STORE_DATA_SUBCAT_MAP[category]
        if category in STORE_DATA_CATEGORY_MAP:
            return STORE_DATA_CATEGORY_MAP[category]

    if not product_name:
        return "GENERAL"

    name_lower = product_name.lower()
    if any(w in name_lower for w in ["milk", "doodh", "curd", "paneer", "cheese", "butter", "ghee"]):
        return "DAIRY"
    if any(w in name_lower for w in ["rice", "chawal", "atta", "flour", "dal", "sugar", "cheeni", "salt", "namak", "oil", "tel", "spices", "haldi"]):
        return "GROCERY"
    if any(w in name_lower for w in ["maggi", "noodles", "biscuit", "chips", "namkeen", "lays", "parle"]):
        return "PACKAGED_FOOD"
    if any(w in name_lower for w in ["tea", "chai", "coffee", "pepsi", "cold drink", "thanda", "juice", "water"]):
        return "BEVERAGES"
    if any(w in name_lower for w in ["soap", "lux", "shampoo", "toothpaste"]):
        return "PERSONAL_CARE"
    if any(w in name_lower for w in ["surf", "detergent", "cleaner"]):
        return "CLEANING"
    if any(w in name_lower for w in ["bread", "pav", "cake"]):
        return "BAKERY"
    if any(w in name_lower for w in ["egg", "anda"]):
        return "EGGS_MEAT"

    return "GENERAL"


def get_family_code(family: str, family_list: list = None) -> int:
    """Return integer code for family given a family list."""
    if not family_list:
        family_list = KIRANA_CATEGORIES
    if family in family_list:
        return family_list.index(family)
    return 0
