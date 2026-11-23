/* data.js — the entire catalog. Hand-built, no external API, no scraping.
   Everything below is fictionalised-but-plausible Lucknow catalog data. */

const CUISINE_ICONS = [
  { key: 'biryani', label: 'Biryani', art: 'biryani' },
  { key: 'pizza', label: 'Pizza', art: 'pizza' },
  { key: 'burger', label: 'Burger', art: 'burger' },
  { key: 'south', label: 'South Indian', art: 'dosa' },
  { key: 'rolls', label: 'Rolls', art: 'roll' },
  { key: 'chinese', label: 'Chinese', art: 'noodles' },
  { key: 'northindian', label: 'North Indian', art: 'thali' },
  { key: 'kebab', label: 'Kebabs', art: 'kebab' },
  { key: 'dessert', label: 'Desserts', art: 'dessert' },
  { key: 'chai', label: 'Tea & Coffee', art: 'chai' },
];

const COUPONS = [
  { code: 'WELCOME50', type: 'pct', value: 50, cap: 100, min: 199, desc: '50% off up to ₹100', sub: 'On orders above ₹199' },
  { code: 'TRYNEW', type: 'pct', value: 30, cap: 75, min: 149, desc: '30% off up to ₹75', sub: 'On orders above ₹149' },
  { code: 'SWIGGYIT', type: 'flat', value: 60, min: 299, desc: 'Flat ₹60 off', sub: 'On orders above ₹299' },
  { code: 'FREEDEL', type: 'freedel', value: 0, min: 99, desc: 'Free delivery', sub: 'On orders above ₹99' },
  { code: 'ONE50', type: 'flat', value: 50, min: 0, desc: 'Flat ₹50 off', sub: 'Swiggy One members only', one: true },
];

/* item: [id, name, price, desc, veg, bestseller, art, addons?] */
const R = [];
function rest(o) { R.push(o); return o; }

rest({
  id: 'tunday',
  name: 'Tunday Kababi',
  cuisines: ['Mughlai', 'Awadhi', 'Biryani'],
  area: 'Aminabad',
  rating: 4.4, ratingCount: '12.8K',
  time: 32, distance: 2.1,
  priceForOne: 250,
  offer: 'Flat 20% OFF',
  offerSub: 'above ₹249',
  art: 'kebab', seed: 3,
  promo: 'legendary',
  deliveryFee: 25, freeAbove: 199,
  menu: [
    ['Bestsellers', [
      ['t1', 'Galouti Kebab (4 pcs)', 160, 'Melt-in-mouth minced mutton kebabs, the Aminabad original, served with warm sheermal.', false, true, 'kebab', 1],
      ['t2', 'Ulte Tawe Ka Paratha', 40, 'Featherweight Awadhi paratha flipped on the inverted tawa. Flaky, chewy, essential.', true, false, 'thali', 2],
      ['t3', 'Mutton Biryani', 280, 'Long-grain basmati layered over slow-cooked mutton, sealed dum, served with raita.', false, true, 'biryani', 4],
    ]],
    ['Kebabs', [
      ['t4', 'Kakori Kebab (4 pcs)', 260, 'Saffron-soft minced mutton kebab from the Kakori line. Charred edges, silk centre.', false, false, 'kebab', 5],
      ['t5', 'Veg Galouti (4 pcs)', 140, 'Raw banana and paneer galouti, same spice route, no meat.', true, false, 'kebab', 6],
      ['t6', 'Shami Kebab (2 pcs)', 130, 'Chana dal and mutton shami, pan-seared with an egg wash.', false, false, 'kebab', 7],
    ]],
    ['Breads & Sides', [
      ['t7', 'Sheermal', 50, 'Saffron-milk sweet bread. The right thing under a galouti.', true, false, 'roll', 8],
      ['t8', 'Biryani Raita', 30, 'Curd, roasted cumin, onion, a little green chilli.', true, false, 'thali', 9],
      ['t9', 'Shorba', 60, 'Mutton bone broth with fried onion and mint.', false, false, 'chai', 10],
    ]],
  ],
});

rest({
  id: 'wahid',
  name: 'Wahid Biryani',
  cuisines: ['Biryani', 'Mughlai', 'Kebabs'],
  area: 'Aminabad',
  rating: 4.3, ratingCount: '8.2K',
  time: 38, distance: 3.4,
  priceForOne: 300,
  offer: '₹125 OFF',
  offerSub: 'above ₹349',
  art: 'biryani', seed: 11,
  promo: 'bestseller',
  deliveryFee: 30, freeAbove: 249,
  menu: [
    ['Biryani', [
      ['w1', 'Mutton Biryani', 320, 'The Yahiaganj benchmark. Layered, heavy on ghee, mutton falling off the bone.', false, true, 'biryani', 12],
      ['w2', 'Chicken Biryani', 230, 'Same dum, lighter meat. Comes with salan and raita.', false, true, 'biryani', 13],
      ['w3', 'Veg Biryani', 170, 'Seasonal vegetables, kewra water, fried onion.', true, false, 'biryani', 14],
    ]],
    ['Korma & Kebab', [
      ['w4', 'Gosht Korma', 260, 'Brown onion gravy, mutton, slow heat for four hours.', false, false, 'thali', 15],
      ['w5', 'Shami Kebab', 120, 'Two fat shami patties, lemon and onion rings.', false, false, 'kebab', 16],
    ]],
    ['Extras', [
      ['w6', 'Raita', 30, 'Boondi or plain — we send plain.', true, false, 'thali', 17],
      ['w7', 'Salad', 25, 'Onion, cucumber, lemon, green chilli.', true, false, 'veg', 18],
    ]],
  ],
});

rest({
  id: 'dastarkhwan',
  name: 'Dastarkhwan',
  cuisines: ['Awadhi', 'North Indian', 'Mughlai'],
  area: 'Hazratganj',
  rating: 4.5, ratingCount: '21.4K',
  time: 28, distance: 1.6,
  priceForOne: 350,
  offer: 'Flat 15% OFF',
  offerSub: 'above ₹199',
  art: 'thali', seed: 19,
  promo: 'free',
  deliveryFee: 0, freeAbove: 0,
  menu: [
    ['Awadhi Classics', [
      ['d1', 'Mutton Nihari', 320, 'Overnight-braised shank, marrow, ginger julienne. Comes with a kulcha.', false, true, 'thali', 20],
      ['d2', 'Kakori Kebab (4 pcs)', 240, 'Minced, spiced, skewered over coal. Order two.', false, false, 'kebab', 21],
      ['d3', 'Chicken Korma', 260, 'White korma — cashew, cream, cardamom. Mild and rich.', false, false, 'thali', 22],
    ]],
    ['Breads', [
      ['d4', 'Butter Naan', 45, 'Tandoor naan, generous butter finish.', true, false, 'roll', 23],
      ['d5', 'Kulcha', 40, 'Stuffed with onion and coriander.', true, false, 'roll', 24],
    ]],
    ['Dessert', [
      ['d6', 'Phirni', 60, 'Rice-milk pudding in a clay bowl, pistachio dust.', true, false, 'dessert', 25],
      ['d7', 'Shahi Tukda', 80, 'Fried bread, saffron rabri, silver leaf.', true, false, 'cake', 26],
    ]],
  ],
});

rest({
  id: 'royalcafe',
  name: 'Royal Cafe',
  cuisines: ['North Indian', 'Continental', 'Chinese'],
  area: 'Hazratganj',
  rating: 4.2, ratingCount: '15.1K',
  time: 35, distance: 1.9,
  priceForOne: 400,
  offer: '₹150 OFF',
  offerSub: 'above ₹499',
  art: 'burger', seed: 27,
  promo: 'trending',
  deliveryFee: 35, freeAbove: 399,
  menu: [
    ['Their Famous Basket', [
      ['r1', 'Chicken Basket', 350, 'The basket that made the place — fried chicken, fries, coleslaw, dip.', false, true, 'burger', 28],
      ['r2', 'Veg Basket', 280, 'Paneer fingers, potato wedges, garlic bread, dip.', true, false, 'burger', 29],
    ]],
    ['Starters', [
      ['r3', 'Paneer Tikka', 240, 'Hung-curd marinade, coal char, mint chutney.', true, false, 'kebab', 30],
      ['r4', 'Chicken Malai Tikka', 260, 'Cream and cheese marinade, very mild heat.', false, false, 'kebab', 31],
    ]],
    ['Beverages', [
      ['r5', 'Cold Coffee', 120, 'Thick, chilled, not oversweet.', true, false, 'chai', 32],
      ['r6', 'Fresh Lime Soda', 80, 'Sweet, salted or mixed.', true, false, 'chai', 33],
    ]],
  ],
});

rest({
  id: 'barbeque',
  name: 'Barbeque Nation',
  cuisines: ['BBQ', 'North Indian', 'Buffet'],
  area: 'Gomti Nagar',
  rating: 4.6, ratingCount: '31.7K',
  time: 45, distance: 4.8,
  priceForOne: 700,
  offer: 'Flat 25% OFF',
  offerSub: 'above ₹599',
  art: 'kebab', seed: 34,
  promo: 'bestseller',
  deliveryFee: 45, freeAbove: 599,
  menu: [
    ['Grill Box', [
      ['b1', 'BBQ Chicken Wings (6)', 329, 'Smoked, glazed, finished with peri-peri dust.', false, true, 'kebab', 35],
      ['b2', 'Peri Peri Paneer', 299, 'Thick paneer slabs, peri-peri butter baste.', true, false, 'kebab', 36],
      ['b3', 'Veg Seekh Kebab (4)', 259, 'Mixed vegetable seekh, mint chutney tub.', true, false, 'kebab', 37],
    ]],
    ['Mains', [
      ['b4', 'Mutton Galouti (4 pcs)', 399, 'Signature box with sheermal and onion.', false, true, 'kebab', 38],
      ['b5', 'Dal Bukhara', 289, 'Whole black urad, twelve hours, cream and butter finish.', true, false, 'thali', 39],
    ]],
    ['Dessert', [
      ['b6', 'Gulab Jamun (2)', 99, 'Warm, syrup-heavy, served with rabri.', true, false, 'dessert', 40],
    ]],
  ],
});

rest({
  id: 'dominos',
  name: "Domino's Pizza",
  cuisines: ['Pizza', 'Fast Food', 'Italian'],
  area: 'Gomti Nagar',
  rating: 4.1, ratingCount: '42.9K',
  time: 25, distance: 2.4,
  priceForOne: 200,
  offer: 'Flat 30% OFF',
  offerSub: 'up to ₹120',
  art: 'pizza', seed: 41,
  promo: 'free',
  deliveryFee: 0, freeAbove: 0,
  menu: [
    ['Pizza', [
      ['p1', 'Margherita', 119, 'Classic, tomato sauce, mozzarella. The baseline test.', true, true, 'pizza', 42],
      ['p2', 'Peppy Paneer', 239, 'Paneer, capsicum, red paprika. Spicy and firm.', true, false, 'pizza', 43],
      ['p3', 'Chicken Dominator', 399, 'Loaded — chicken tikka, sausage, barbeque chicken.', false, true, 'pizza', 44],
      ['p4', 'Farmhouse', 269, 'Onion, capsicum, tomato, mushroom on a cheesy base.', true, false, 'pizza', 45],
    ]],
    ['Sides', [
      ['p5', 'Garlic Breadsticks', 109, 'Baked, brushed with garlic butter, dip included.', true, false, 'roll', 46],
      ['p6', 'Chicken Parcel', 229, 'Baked pocket stuffed with spicy chicken.', false, false, 'roll', 47],
    ]],
    ['Dessert', [
      ['p7', 'Choco Lava Cake', 109, 'Molten centre. Eat it while it is hot.', true, true, 'cake', 48],
    ]],
  ],
});

rest({
  id: 'burgersingh',
  name: 'Burger Singh',
  cuisines: ['Burgers', 'Fast Food', 'Beverages'],
  area: 'Aliganj',
  rating: 4.0, ratingCount: '9.6K',
  time: 30, distance: 3.2,
  priceForOne: 250,
  offer: 'Buy 1 Get 1',
  offerSub: 'on burgers',
  art: 'burger', seed: 49,
  promo: 'new',
  deliveryFee: 29, freeAbove: 199,
  menu: [
    ['Burgers', [
      ['g1', 'Desi Chilli Chicken Burger', 189, 'Crunchy chicken patty, chilli mayo, onion, jalapeños.', false, true, 'burger', 50],
      ['g2', 'Punjabi Tadka Burger', 159, 'Paneer and veg patty with a makhani-style smear.', true, false, 'burger', 51],
      ['g3', 'Amritsari Mutton Burger', 229, 'Slow-cooked mutton keema patty, mint aioli.', false, false, 'burger', 52],
    ]],
    ['Sides', [
      ['g4', 'Peri Peri Fries', 129, 'Crinkle cut, peri-peri dust, extra salt.', true, false, 'burger', 53],
      ['g5', 'Chicken Popcorn', 149, 'Bite-size fried chicken with a ranch dip.', false, false, 'burger', 54],
    ]],
    ['Drinks', [
      ['g6', 'Cold Coffee Shake', 119, 'Thick, tall glass, too much caffeine — as intended.', true, false, 'chai', 55],
    ]],
  ],
});

rest({
  id: 'rollsmania',
  name: 'Rolls Mania',
  cuisines: ['Rolls', 'Wraps', 'Mughlai'],
  area: 'Lalbagh',
  rating: 4.2, ratingCount: '6.1K',
  time: 22, distance: 2.8,
  priceForOne: 180,
  offer: 'Flat 40% OFF',
  offerSub: 'above ₹149',
  art: 'roll', seed: 56,
  promo: 'free',
  deliveryFee: 19, freeAbove: 149,
  menu: [
    ['Rolls', [
      ['m1', 'Chicken Tikka Roll', 149, 'Tandoori tikka, onion, chutney, egg-washed paratha.', false, true, 'roll', 57],
      ['m2', 'Paneer Roll', 129, 'Malai paneer, capsicum, mint chutney.', true, false, 'roll', 58],
      ['m3', 'Egg Roll', 89, 'Double egg wash, onion and lemon. The cheap classic.', false, false, 'roll', 59],
      ['m4', 'Double Egg Chicken Roll', 189, 'Two eggs, chicken tikka, everything.', false, true, 'roll', 60],
    ]],
    ['Sides', [
      ['m5', 'Masala Fries', 99, 'Chaat masala, extra lemon.', true, false, 'burger', 61],
    ]],
  ],
});

rest({
  id: 'haldirams',
  name: "Haldiram's",
  cuisines: ['North Indian', 'Sweets', 'Snacks'],
  area: 'Alambagh',
  rating: 4.4, ratingCount: '18.3K',
  time: 26, distance: 3.9,
  priceForOne: 250,
  offer: '₹100 OFF',
  offerSub: 'above ₹299',
  art: 'thali', seed: 62,
  promo: 'free',
  deliveryFee: 0, freeAbove: 0,
  menu: [
    ['Chaat & Snacks', [
      ['h1', 'Raj Kachori', 90, 'Big, filled, drowned in curd and two chutneys.', true, true, 'thali', 63],
      ['h2', 'Chole Bhature', 120, 'Two bhature, dark chole, onion and pickle.', true, true, 'thali', 64],
      ['h3', 'Paneer Tikka', 230, 'Tandoor paneer, six pieces, mint chutney.', true, false, 'kebab', 65],
    ]],
    ['Mains', [
      ['h4', 'Dal Makhani', 190, 'Slow-cooked, buttery, portion is generous.', true, false, 'thali', 66],
      ['h5', 'Veg Thali', 220, 'Dal, seasonal sabzi, rice, two roti, sweet, papad.', true, false, 'thali', 67],
    ]],
    ['Sweets', [
      ['h6', 'Gulab Jamun (2)', 70, 'Warm, syrupy, dispatched in a sealed bowl.', true, false, 'dessert', 68],
      ['h7', 'Rasmalai (2)', 95, 'Saffron milk, soft chenna discs.', true, false, 'dessert', 69],
    ]],
  ],
});

rest({
  id: 'pizzahut',
  name: 'Pizza Hut',
  cuisines: ['Pizza', 'Italian', 'Pasta'],
  area: 'Hazratganj',
  rating: 4.0, ratingCount: '27.5K',
  time: 33, distance: 1.7,
  priceForOne: 350,
  offer: '₹150 OFF',
  offerSub: 'above ₹399',
  art: 'pizza', seed: 70,
  promo: 'trending',
  deliveryFee: 29, freeAbove: 299,
  menu: [
    ['Pizza', [
      ['z1', 'Cheesy Bites Margherita', 199, 'Stuffed crust, cheese bites around the rim.', true, true, 'pizza', 71],
      ['z2', 'Veggie Supreme', 349, 'Onion, capsicum, corn, olives, tomato.', true, false, 'pizza', 72],
      ['z3', 'Chicken Supreme', 419, 'Chicken tikka, sausage, onion, capsicum.', false, false, 'pizza', 73],
    ]],
    ['Pasta & Sides', [
      ['z4', 'Pasta Italiano', 259, 'Penne in arrabbiata with herbs and cheese.', true, false, 'noodles', 74],
      ['z5', 'Garlic Bread', 119, 'Four pieces, herb butter.', true, false, 'roll', 75],
    ]],
  ],
});

rest({
  id: 'chaisutta',
  name: 'Chai Sutta Bar',
  cuisines: ['Beverages', 'Cafe', 'Snacks'],
  area: 'Aliganj',
  rating: 4.3, ratingCount: '11.9K',
  time: 18, distance: 2.6,
  priceForOne: 100,
  offer: 'Flat 20% OFF',
  offerSub: 'up to ₹60',
  art: 'chai', seed: 76,
  promo: 'free',
  deliveryFee: 15, freeAbove: 99,
  menu: [
    ['Chai & Coffee', [
      ['c1', 'Adrak Chai', 30, 'Ginger, cardamom, clay kulhad. The house default.', true, true, 'chai', 77],
      ['c2', 'Kulhad Coffee', 40, 'Milk coffee in a kulhad, mildly sweet.', true, false, 'chai', 78],
      ['c3', 'Rose Chai', 40, 'Gulkand and rose petals, odd until it is not.', true, false, 'chai', 79],
    ]],
    ['Bites', [
      ['c4', 'Bun Maska', 40, 'Soft bun, salted butter, toasted edges.', true, false, 'roll', 80],
      ['c5', 'Cheese Maggi', 70, 'The 2-minute lie with a cheese blanket.', true, true, 'noodles', 81],
      ['c6', 'Veg Sandwich', 60, 'Cucumber, tomato, chutney, white bread.', true, false, 'roll', 82],
    ]],
  ],
});

rest({
  id: 'biryani_blues',
  name: 'Biryani Blues',
  cuisines: ['Biryani', 'Hyderabadi', 'Kebabs'],
  area: 'Vibhuti Khand',
  rating: 4.2, ratingCount: '7.7K',
  time: 36, distance: 5.1,
  priceForOne: 280,
  offer: 'Flat ₹75 OFF',
  offerSub: 'above ₹349',
  art: 'biryani', seed: 83,
  promo: 'new',
  deliveryFee: 25, freeAbove: 249,
  menu: [
    ['Biryani', [
      ['y1', 'Hyderabadi Chicken Biryani', 229, 'Dum-cooked, mirchi ka salan and raita included.', false, true, 'biryani', 84],
      ['y2', 'Veg Dum Biryani', 179, 'Carrot, beans, paneer, saffron rice.', true, false, 'biryani', 85],
      ['y3', 'Mutton Biryani', 329, 'Bone-in mutton, long grain, heavy saffron.', false, false, 'biryani', 86],
    ]],
    ['Kebabs', [
      ['y4', 'Chicken Seekh', 219, 'Four skewers, charred, mint chutney.', false, false, 'kebab', 87],
      ['y5', 'Dahi Chutney', 25, 'Thick curd, garlic, green chilli.', true, false, 'thali', 88],
    ]],
  ],
});

rest({
  id: 'lucknowi_kitchen',
  name: 'Lucknowi Kitchen',
  cuisines: ['North Indian', 'Tandoor', 'Home Style'],
  area: 'Indira Nagar',
  rating: 3.9, ratingCount: '3.2K',
  time: 29, distance: 4.2,
  priceForOne: 220,
  offer: '₹60 OFF',
  offerSub: 'above ₹199',
  art: 'thali', seed: 89,
  promo: '',
  deliveryFee: 25, freeAbove: 199,
  menu: [
    ['Mains', [
      ['k1', 'Paneer Butter Masala', 220, 'Sweet tomato-cashew gravy, tandoor paneer.', true, true, 'thali', 90],
      ['k2', 'Chicken Curry', 240, 'Ghar-ka-style, thin gravy, three pieces.', false, false, 'thali', 91],
      ['k3', 'Dal Fry', 150, 'Yellow dal, ghee tadka.', true, false, 'thali', 92],
    ]],
    ['Breads', [
      ['k4', 'Tandoori Roti', 25, 'Whole wheat, straight off the tandoor.', true, false, 'roll', 93],
      ['k5', 'Laccha Paratha', 45, 'Layered, flaky, buttered.', true, false, 'roll', 94],
    ]],
  ],
});

/* ---------------- Instamart catalog ---------------- */
const INSTA_CATS = ['Vegetables', 'Snacks', 'Dairy & Bread', 'Cold Drinks', 'Instant Food', 'Personal Care'];

const INSTA = [
  ['i1', 'Onion (Pyaz)', '1 kg', 39, 55, 'veg', 1, 'Vegetables'],
  ['i2', 'Tomato (Tamatar)', '500 g', 24, 32, 'veg', 2, 'Vegetables'],
  ['i3', 'Potato (Aloo)', '1 kg', 29, 40, 'veg', 3, 'Vegetables'],
  ['i4', 'Banana (Robusta)', '6 pcs', 49, 62, 'veg', 4, 'Vegetables'],
  ['i5', 'Baby Spinach', '250 g', 35, 45, 'veg', 5, 'Vegetables'],
  ['i6', 'Capsicum Green', '250 g', 22, 30, 'veg', 6, 'Vegetables'],
  ['i7', "Lay's Classic Salted", '52 g', 20, 20, 'grocery', 7, 'Snacks'],
  ['i8', 'Kurkure Masala Munch', '90 g', 20, 20, 'grocery', 8, 'Snacks'],
  ['i9', 'Oreo Biscuits', '120 g', 40, 50, 'grocery', 9, 'Snacks'],
  ['i10', 'Haldiram Bhujia', '200 g', 62, 75, 'grocery', 10, 'Snacks'],
  ['i11', 'Amul Taaza Milk', '500 ml', 28, 30, 'grocery', 11, 'Dairy & Bread'],
  ['i12', 'Amul Butter', '100 g', 58, 62, 'grocery', 12, 'Dairy & Bread'],
  ['i13', 'Britannia Brown Bread', '400 g', 45, 50, 'grocery', 13, 'Dairy & Bread'],
  ['i14', 'Amul Cheese Slices', '200 g', 125, 145, 'grocery', 14, 'Dairy & Bread'],
  ['i15', 'Curd (Dahi) Cup', '400 g', 42, 50, 'grocery', 15, 'Dairy & Bread'],
  ['i16', 'Coca-Cola', '750 ml', 40, 45, 'chai', 16, 'Cold Drinks'],
  ['i17', 'Sprite', '750 ml', 40, 45, 'chai', 17, 'Cold Drinks'],
  ['i18', 'Tropicana Orange', '1 L', 110, 125, 'chai', 18, 'Cold Drinks'],
  ['i19', 'Red Bull', '250 ml', 125, 135, 'chai', 19, 'Cold Drinks'],
  ['i20', 'Maggi 2-Minute Noodles', '280 g (4 pack)', 56, 64, 'noodles', 20, 'Instant Food'],
  ['i21', 'Knorr Classic Noddles', '180 g', 55, 60, 'noodles', 21, 'Instant Food'],
  ['i22', 'Yippee Masala Noodles', '270 g', 48, 54, 'noodles', 22, 'Instant Food'],
  ['i23', 'Dettol Handwash Refill', '750 ml', 99, 120, 'grocery', 23, 'Personal Care'],
  ['i24', 'Colgate Strong Teeth', '200 g', 105, 115, 'grocery', 24, 'Personal Care'],
  ['i25', 'Dove Soap (3 pack)', '3 x 100 g', 165, 195, 'grocery', 25, 'Personal Care'],
].map(([id, name, unit, price, mrp, art, seed, cat]) => ({ id, name, unit, price, mrp, art, seed, cat }));

/* ---------------- Dineout venues ---------------- */
const DINEOUT = [
  { id: 'dn1', name: 'Sky Bar, Lebua', area: 'Gomti Nagar', rating: 4.5, art: 'chai', seed: 101, offer: 'Flat 25% off on food bill', cuisine: 'Rooftop · Continental · Bar', slots: ['07:30 PM', '08:15 PM', '09:00 PM', '09:45 PM'] },
  { id: 'dn2', name: 'The Nawab’s Table', area: 'Hazratganj', rating: 4.4, art: 'thali', seed: 102, offer: 'Buy 1 Get 1 on kebabs', cuisine: 'Awadhi · Fine Dining', slots: ['01:00 PM', '01:45 PM', '08:00 PM', '08:45 PM'] },
  { id: 'dn3', name: 'Biryani House', area: 'Aminabad', rating: 4.2, art: 'biryani', seed: 103, offer: 'Flat 20% off', cuisine: 'Biryani · Mughlai', slots: ['12:30 PM', '02:00 PM', '07:30 PM'] },
  { id: 'dn4', name: 'Saffron Roof', area: 'Gomti Nagar', rating: 4.3, art: 'kebab', seed: 104, offer: 'Free dessert on 4 guests', cuisine: 'North Indian · Live Grill', slots: ['08:00 PM', '09:30 PM'] },
];

const DEFAULT_ADDRESSES = [
  { id: 'a1', tag: 'Home', line: 'B-42, Sector 14, Gomti Nagar, Lucknow', detail: 'Near Fun Republic Mall, 226010' },
  { id: 'a2', tag: 'Work', line: '4th Floor, Cyber Heights, Vibhuti Khand, Lucknow', detail: 'Reception desk, 226010' },
];

window.CATALOG = { R, INSTA, INSTA_CATS, DINEOUT, COUPONS, DEFAULT_ADDRESSES, CUISINE_ICONS };
