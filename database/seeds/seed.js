// STRIDERA — Complete 7-Role Database Seed Script
// Run: node database/seeds/seed.js
// Seeds all 7 roles (Shopper, Seller, Admin, Inventory Manager, Delivery Personnel, Customer Support, Finance Officer),
// multi-seller brands & products, sample orders, shipments, support tickets, payouts, reviews, and platform config.

const path = require('path');
const prisma = require(path.resolve(__dirname, '../../backend/src/lib/prisma'));
const argon2 = require(path.resolve(__dirname, '../../backend/node_modules/argon2'));

async function main() {
  console.log('🌱 Seeding STRIDERA 7-Role Multi-Seller E-Commerce Database...\n');

  // ────────────────────────────────────────────────
  //  0. PLATFORM CONFIGURATION
  // ────────────────────────────────────────────────
  await prisma.platformConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      platformFeePercent: 5,
      lowStockThreshold: 5,
      shippingFeeCentavos: 15000,
      freeShippingThresholdCentavos: 300000,
      enabledWallets: 'gcash,maya,paypal',
      sandboxMode: true
    }
  });

  // ────────────────────────────────────────────────
  //  1. CATEGORIES (FR-2.2)
  // ────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'running' },
      update: {},
      create: {
        name: 'Running',
        slug: 'running',
        description: 'High-performance running shoes engineered for speed, comfort, and endurance.',
        imageUrl: '/assets/products/running-men-1.jpg',
        sortOrder: 1
      }
    }),
    prisma.category.upsert({
      where: { slug: 'lifestyle' },
      update: {},
      create: {
        name: 'Lifestyle & Sneakers',
        slug: 'lifestyle',
        description: 'Everyday sneakers and casual footwear that blend street style and comfort.',
        imageUrl: '/assets/products/sneaker-women-1.jpg',
        sortOrder: 2
      }
    }),
    prisma.category.upsert({
      where: { slug: 'basketball' },
      update: {},
      create: {
        name: 'Basketball',
        slug: 'basketball',
        description: '[Demo] Court-ready basketball shoes with ankle support and cushioning.',
        imageUrl: '/assets/products/running-men-3.jpg',
        sortOrder: 3
      }
    }),
    prisma.category.upsert({
      where: { slug: 'training' },
      update: {},
      create: {
        name: 'Training & Boots',
        slug: 'training',
        description: '[Demo] Versatile cross-training shoes and durable athletic boots.',
        imageUrl: '/assets/products/sneaker-men-1.jpg',
        sortOrder: 4
      }
    })
  ]);

  const [running, lifestyle, basketball, training] = categories;
  console.log('✅ Categories created');

  // ────────────────────────────────────────────────
  //  2. ALL 7 USER ROLES (Section B & FR-1.3)
  // ────────────────────────────────────────────────
  const adminPasswordHash = await argon2.hash('Admin@Stridera2024!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@stridera.ph' },
    update: { role: 'ADMIN', isActive: true, accountStatus: 'ACTIVE' },
    create: {
      email: 'admin@stridera.ph',
      passwordHash: adminPasswordHash,
      firstName: 'STRIDERA',
      lastName: 'Administrator',
      role: 'ADMIN',
      isActive: true,
      accountStatus: 'ACTIVE',
      phone: '+639170000001'
    }
  });

  const customerPasswordHash = await argon2.hash('Customer@123!');
  const customer = await prisma.user.upsert({
    where: { email: 'demo@stridera.ph' },
    update: { role: 'CUSTOMER', isActive: true, accountStatus: 'ACTIVE' },
    create: {
      email: 'demo@stridera.ph',
      passwordHash: customerPasswordHash,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      role: 'CUSTOMER',
      isActive: true,
      accountStatus: 'ACTIVE',
      phone: '+639171111111',
      addresses: {
        create: {
          label: 'Home',
          fullName: 'Juan Dela Cruz',
          phone: '+639171111111',
          addressLine1: '123 Ayala Avenue, Legazpi Village',
          city: 'Makati',
          province: 'Metro Manila',
          postalCode: '1229',
          country: 'PH',
          isDefault: true
        }
      }
    }
  });

  const sellerPasswordHash = await argon2.hash('Seller@123!');
  const seller = await prisma.user.upsert({
    where: { email: 'seller@stridera.ph' },
    update: {
      role: 'SELLER',
      sellerStatus: 'APPROVED',
      storeName: 'Apex Footwear Hub',
      identificationDetails: 'DTI Reg No: DTI-NCR-2026-0084192 | BIR TIN: 412-889-102-000 | Verified Metro Manila Distributor',
      storeLogoUrl: '/assets/logo/stridera-logo.png'
    },
    create: {
      email: 'seller@stridera.ph',
      passwordHash: sellerPasswordHash,
      firstName: 'Marco',
      lastName: 'Reyes',
      role: 'SELLER',
      sellerStatus: 'APPROVED',
      storeName: 'Apex Footwear Hub',
      storeDescription: 'Authorized vendor for high-performance marathon and athletic footwear in Metro Manila.',
      storeLogoUrl: '/assets/logo/stridera-logo.png',
      identificationDetails: 'DTI Reg No: DTI-NCR-2026-0084192 | BIR TIN: 412-889-102-000 | Verified Metro Manila Distributor',
      phone: '+639172222222'
    }
  });

  const seller2 = await prisma.user.upsert({
    where: { email: 'sole@stridera.ph' },
    update: {
      role: 'SELLER',
      sellerStatus: 'APPROVED',
      storeName: 'Manila Sole Collective',
      identificationDetails: 'DTI Reg No: DTI-NCR-2026-0091204 | BIR TIN: 509-231-884-000 | Verified Bonifacio Global City Retailer',
      storeLogoUrl: '/assets/logo/stridera-logo.png'
    },
    create: {
      email: 'sole@stridera.ph',
      passwordHash: sellerPasswordHash,
      firstName: 'bianca',
      lastName: 'Santos',
      role: 'SELLER',
      sellerStatus: 'APPROVED',
      storeName: 'Manila Sole Collective',
      storeDescription: 'Curated lifestyle sneakers, court classics, and everyday comfort footwear.',
      storeLogoUrl: '/assets/logo/stridera-logo.png',
      identificationDetails: 'DTI Reg No: DTI-NCR-2026-0091204 | BIR TIN: 509-231-884-000 | Verified Bonifacio Global City Retailer',
      phone: '+639172223333'
    }
  });

  const pendingSeller = await prisma.user.upsert({
    where: { email: 'pending.seller@stridera.ph' },
    update: {
      identificationDetails: 'DTI Reg No: DTI-CAL-2026-0041982 | Pending Gov ID Verification'
    },
    create: {
      email: 'pending.seller@stridera.ph',
      passwordHash: sellerPasswordHash,
      firstName: 'Stride',
      lastName: 'Applicant',
      role: 'SELLER',
      sellerStatus: 'PENDING',
      storeName: 'Stride Dynamics PH',
      storeDescription: 'Custom and lifestyle sneakers seeking platform approval.',
      identificationDetails: 'DTI Reg No: DTI-CAL-2026-0041982 | Pending Gov ID Verification',
      phone: '+639173333333'
    }
  });

  // Role 4: Inventory Manager
  const inventoryPasswordHash = await argon2.hash('Inventory@123!');
  const inventoryManager = await prisma.user.upsert({
    where: { email: 'inventory@stridera.ph' },
    update: { role: 'INVENTORY_MANAGER', isActive: true, accountStatus: 'ACTIVE' },
    create: {
      email: 'inventory@stridera.ph',
      passwordHash: inventoryPasswordHash,
      firstName: 'Carlo',
      lastName: 'Mendoza',
      role: 'INVENTORY_MANAGER',
      isActive: true,
      accountStatus: 'ACTIVE',
      phone: '+639174444444'
    }
  });

  // Role 5: Delivery Personnel
  const deliveryPasswordHash = await argon2.hash('Delivery@123!');
  const deliveryPersonnel = await prisma.user.upsert({
    where: { email: 'delivery@stridera.ph' },
    update: { role: 'DELIVERY_PERSONNEL', isActive: true, accountStatus: 'ACTIVE' },
    create: {
      email: 'delivery@stridera.ph',
      passwordHash: deliveryPasswordHash,
      firstName: 'Ramon',
      lastName: 'Bautista',
      role: 'DELIVERY_PERSONNEL',
      isActive: true,
      accountStatus: 'ACTIVE',
      phone: '+639175555555'
    }
  });

  // Role 6: Customer Support Personnel
  const supportPasswordHash = await argon2.hash('Support@123!');
  const supportPersonnel = await prisma.user.upsert({
    where: { email: 'support@stridera.ph' },
    update: { role: 'CUSTOMER_SUPPORT', isActive: true, accountStatus: 'ACTIVE' },
    create: {
      email: 'support@stridera.ph',
      passwordHash: supportPasswordHash,
      firstName: 'Clarisse',
      lastName: 'Villanueva',
      role: 'CUSTOMER_SUPPORT',
      isActive: true,
      accountStatus: 'ACTIVE',
      phone: '+639176666666'
    }
  });

  // Role 7: Finance Officer
  const financePasswordHash = await argon2.hash('Finance@123!');
  const financeOfficer = await prisma.user.upsert({
    where: { email: 'finance@stridera.ph' },
    update: { role: 'FINANCE_OFFICER', isActive: true, accountStatus: 'ACTIVE' },
    create: {
      email: 'finance@stridera.ph',
      passwordHash: financePasswordHash,
      firstName: 'Patricia',
      lastName: 'Lim',
      role: 'FINANCE_OFFICER',
      isActive: true,
      accountStatus: 'ACTIVE',
      phone: '+639177777777'
    }
  });

  // ────────────────────────────────────────────────
  //  2.1 BRANDS
  // ────────────────────────────────────────────────
  const brandOfficial = await prisma.brand.upsert({
    where: { slug: 'stridera-lab' },
    update: { sellerId: seller2.id },
    create: {
      name: 'STRIDERA Lab',
      slug: 'stridera-lab',
      description: 'Official flagship performance & lifestyle footwear line distributed by Manila Sole Collective.',
      logoUrl: '/assets/logo/stridera-logo.png',
      sellerId: seller2.id,
      isActive: true
    }
  });

  const brandApex = await prisma.brand.upsert({
    where: { slug: 'apex-athletics' },
    update: { sellerId: seller.id },
    create: {
      name: 'Apex Athletics',
      slug: 'apex-athletics',
      description: 'Engineered distance running and endurance footwear curated by Apex Footwear Hub.',
      logoUrl: '/assets/logo/stridera-logo.png',
      sellerId: seller.id,
      isActive: true
    }
  });

  console.log('✅ All 7 Roles & Brands created');

  // ────────────────────────────────────────────────
  //  3. PRODUCTS Across Multiple Sellers
  // ────────────────────────────────────────────────
  const runningMen1 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-M-001' },
    update: { sellerId: seller.id, brandId: brandApex.id },
    create: {
      categoryId: running.id,
      sellerId: seller.id,
      brandId: brandApex.id,
      name: 'Stridera Velocity Pro',
      slug: 'stridera-velocity-pro',
      sku: 'STR-RUN-M-001',
      description: 'Built for serious runners who demand peak performance. The Velocity Pro delivers explosive energy return and adaptive cushioning for every stride.',
      features: 'Lightweight mesh upper • Energy-return foam midsole • Stridera Grip outsole • Breathable lining • Reinforced heel counter',
      basePriceCentavos: 599500,
      compareAtPriceCentavos: 699500,
      audience: 'MEN',
      shoeType: 'RUNNING',
      isFeatured: true,
      images: {
        create: [
          { url: '/assets/products/running-men-1.jpg', altText: 'Stridera Velocity Pro - Side View', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/running-men-2.jpg', altText: 'Stridera Velocity Pro - Detail', sortOrder: 1 }
        ]
      },
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12'].flatMap(size => [
          { variantSku: `STR-RUN-M-001-${size}-BLK`, size, color: 'Black/Teal', colorHex: '#0D1117', stockQuantity: size === '9' || size === '10' ? 3 : 8 },
          { variantSku: `STR-RUN-M-001-${size}-LIM`, size, color: 'Black/Lime', colorHex: '#C8E047', stockQuantity: size === '12' ? 0 : 5 }
        ])
      }
    }
  });

  const runningMen2 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-M-002' },
    update: { sellerId: seller.id, brandId: brandApex.id },
    create: {
      categoryId: running.id,
      sellerId: seller.id,
      brandId: brandApex.id,
      name: 'Stridera Max Energy X',
      slug: 'stridera-max-energy-x',
      sku: 'STR-RUN-M-002',
      description: 'Maximum energy return for long-distance training. The Max Energy X features a dual-layer midsole and carbon-fiber plate for elite performance.',
      features: 'Engineered knit upper • Carbon-fiber propulsion plate • Dual-density midsole • Wide toe box • Anti-slip outsole',
      basePriceCentavos: 749500,
      audience: 'MEN',
      shoeType: 'RUNNING',
      isFeatured: true,
      images: {
        create: [
          { url: '/assets/products/running-men-3.jpg', altText: 'Stridera Max Energy X - Front', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/running-men-4.jpg', altText: 'Stridera Max Energy X - Side', sortOrder: 1 },
          { url: '/assets/products/running-men-5.jpg', altText: 'Stridera Max Energy X - Back', sortOrder: 2 }
        ]
      },
      variants: {
        create: ['7', '8', '9', '10', '11', '12'].flatMap(size => [
          { variantSku: `STR-RUN-M-002-${size}-NVY`, size, color: 'Navy/White', colorHex: '#1A3A6B', stockQuantity: 6 }
        ])
      }
    }
  });

  const runningWomen1 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-W-001' },
    update: { sellerId: seller.id, brandId: brandApex.id },
    create: {
      categoryId: running.id,
      sellerId: seller.id,
      brandId: brandApex.id,
      name: 'Stridera Stride Fusion',
      slug: 'stridera-stride-fusion',
      sku: 'STR-RUN-W-001',
      description: 'The Stride Fusion is engineered for women who run with purpose. MAX ENERGY technology provides responsive cushioning from first step to finish line.',
      features: 'Adaptive knit upper • MAX ENERGY foam • Soft heel collar • Flex grooves • Stridera outsole pattern',
      basePriceCentavos: 549500,
      compareAtPriceCentavos: 649500,
      audience: 'WOMEN',
      shoeType: 'RUNNING',
      isFeatured: true,
      images: {
        create: [
          { url: '/assets/products/running-women-1.jpg', altText: 'Stridera Stride Fusion - Main', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/running-women-2.jpg', altText: 'Stridera Stride Fusion - Detail', sortOrder: 1 }
        ]
      },
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10'].flatMap(size => [
          { variantSku: `STR-RUN-W-001-${size}-CRM`, size, color: 'Cream/Pink', colorHex: '#F5E6D3', stockQuantity: 7 },
          { variantSku: `STR-RUN-W-001-${size}-MNT`, size, color: 'Mint/White', colorHex: '#B5E8D5', stockQuantity: 5 }
        ])
      }
    }
  });

  const runningWomen2 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-W-002' },
    update: { sellerId: seller2.id, brandId: brandOfficial.id },
    create: {
      categoryId: running.id,
      sellerId: seller2.id,
      brandId: brandOfficial.id,
      name: 'Stridera Aero Flow',
      slug: 'stridera-aero-flow',
      sku: 'STR-RUN-W-002',
      description: 'Ultra-lightweight design meets premium cushioning in the Aero Flow. Designed for daily training runs with breathable upper and durable outsole.',
      features: 'Perforated mesh upper • Lightweight EVA midsole • Padded collar • Reflective details • Flexible outsole',
      basePriceCentavos: 499500,
      audience: 'WOMEN',
      shoeType: 'RUNNING',
      images: {
        create: [
          { url: '/assets/products/running-women-3.jpg', altText: 'Stridera Aero Flow - Main', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/running-women-4.jpg', altText: 'Stridera Aero Flow - Side', sortOrder: 1 },
          { url: '/assets/products/running-women-5.jpg', altText: 'Stridera Aero Flow - Back', sortOrder: 2 }
        ]
      },
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '10'].flatMap(size => [
          { variantSku: `STR-RUN-W-002-${size}-PNK`, size, color: 'Pink/White', colorHex: '#F4A0B5', stockQuantity: 6 }
        ])
      }
    }
  });

  const sneakerMen1 = await prisma.product.upsert({
    where: { sku: 'STR-LST-M-001' },
    update: { sellerId: seller2.id, brandId: brandOfficial.id },
    create: {
      categoryId: lifestyle.id,
      sellerId: seller2.id,
      brandId: brandOfficial.id,
      name: 'Stridera Heritage Classic',
      slug: 'stridera-heritage-classic',
      sku: 'STR-LST-M-001',
      description: 'Timeless design meets modern comfort. The Heritage Classic features premium leather construction with Stridera\'s signature gold logo accent.',
      features: 'Full-grain leather upper • Gold Stridera logo • Gum rubber outsole • Memory foam insole • Classic lace-up closure',
      basePriceCentavos: 699500,
      audience: 'MEN',
      shoeType: 'LIFESTYLE',
      isFeatured: true,
      images: {
        create: [
          { url: '/assets/products/sneaker-men-1.jpg', altText: 'Stridera Heritage Classic - Main', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/sneaker-men-2.jpg', altText: 'Stridera Heritage Classic - Detail', sortOrder: 1 }
        ]
      },
      variants: {
        create: ['7', '8', '9', '10', '11', '12'].flatMap(size => [
          { variantSku: `STR-LST-M-001-${size}-BRN`, size, color: 'Brown/Gum', colorHex: '#8B6914', stockQuantity: 4 },
          { variantSku: `STR-LST-M-001-${size}-TAN`, size, color: 'Tan/White', colorHex: '#C4A265', stockQuantity: 3 }
        ])
      }
    }
  });

  const sneakerWomen1 = await prisma.product.upsert({
    where: { sku: 'STR-LST-W-001' },
    update: { sellerId: seller2.id, brandId: brandOfficial.id },
    create: {
      categoryId: lifestyle.id,
      sellerId: seller2.id,
      brandId: brandOfficial.id,
      name: 'Stridera Cloud Step',
      slug: 'stridera-cloud-step',
      sku: 'STR-LST-W-001',
      description: 'The Cloud Step combines clean white leather with the iconic Stridera blue "S" and a pop of orange — a signature look for the modern woman.',
      features: 'White leather upper • Stridera blue S logo • Orange accent tab • Cushioned insole • Vulcanized outsole',
      basePriceCentavos: 549500,
      audience: 'WOMEN',
      shoeType: 'LIFESTYLE',
      isFeatured: true,
      images: {
        create: [
          { url: '/assets/products/sneaker-women-1.jpg', altText: 'Stridera Cloud Step - Main', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/sneaker-women-2.jpg', altText: 'Stridera Cloud Step - Alt', sortOrder: 1 }
        ]
      },
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10'].flatMap(size => [
          { variantSku: `STR-LST-W-001-${size}-WHT`, size, color: 'White/Blue', colorHex: '#FFFFFF', stockQuantity: 6 },
          { variantSku: `STR-LST-W-001-${size}-CRM`, size, color: 'Cream/Orange', colorHex: '#FFF3E0', stockQuantity: 4 }
        ])
      }
    }
  });

  const sneakerWomen2 = await prisma.product.upsert({
    where: { sku: 'STR-LST-W-002' },
    update: { sellerId: seller2.id, brandId: brandOfficial.id },
    create: {
      categoryId: lifestyle.id,
      sellerId: seller2.id,
      brandId: brandOfficial.id,
      name: 'Stridera Soft Walk',
      slug: 'stridera-soft-walk',
      sku: 'STR-LST-W-002',
      description: 'All-day comfort in a sleek, minimal silhouette. The Soft Walk is crafted for effortless style from morning coffee to evening walks.',
      features: 'Soft leather upper • Padded ankle collar • Flexible sole • Signature Stridera stitching • Easy slip-on design',
      basePriceCentavos: 449500,
      audience: 'WOMEN',
      shoeType: 'LIFESTYLE',
      images: {
        create: [
          { url: '/assets/products/sneaker-women-3.jpg', altText: 'Stridera Soft Walk - Main', sortOrder: 0, isPrimary: true },
          { url: '/assets/products/sneaker-women-4.jpg', altText: 'Stridera Soft Walk - Side', sortOrder: 1 },
          { url: '/assets/products/sneaker-women-5.jpg', altText: 'Stridera Soft Walk - Back', sortOrder: 2 }
        ]
      },
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '10'].flatMap(size => [
          { variantSku: `STR-LST-W-002-${size}-BLK`, size, color: 'Black', colorHex: '#111111', stockQuantity: 5 },
          { variantSku: `STR-LST-W-002-${size}-WHT`, size, color: 'White', colorHex: '#FFFFFF', stockQuantity: 4 }
        ])
      }
    }
  });

  await prisma.product.upsert({
    where: { sku: 'STR-BSK-M-001' },
    update: { sellerId: seller.id, brandId: brandApex.id },
    create: {
      categoryId: basketball.id,
      sellerId: seller.id,
      brandId: brandApex.id,
      name: '[Demo] Stridera Court Dominator',
      slug: 'stridera-court-dominator',
      sku: 'STR-BSK-M-001',
      description: '[Demo product] High-top basketball shoe with superior ankle support, cushioned midsole, and herringbone grip pattern for explosive court play.',
      features: 'Reinforced ankle collar • Responsive cushioning • Herringbone outsole • Lockdown lacing system',
      basePriceCentavos: 649500,
      audience: 'MEN',
      shoeType: 'BASKETBALL',
      images: {
        create: [
          { url: '/assets/products/running-men-3.jpg', altText: 'Stridera Court Dominator', sortOrder: 0, isPrimary: true }
        ]
      },
      variants: {
        create: ['7', '8', '9', '10', '11', '12'].map(size => ({
          variantSku: `STR-BSK-M-001-${size}-BLK`,
          size,
          color: 'Black/Red',
          colorHex: '#1A1A1A',
          stockQuantity: 5
        }))
      }
    }
  });

  await prisma.product.upsert({
    where: { sku: 'STR-TRN-U-001' },
    update: { sellerId: seller2.id, brandId: brandOfficial.id },
    create: {
      categoryId: training.id,
      sellerId: seller2.id,
      brandId: brandOfficial.id,
      name: '[Demo] Stridera Cross Trainer Pro',
      slug: 'stridera-cross-trainer-pro',
      sku: 'STR-TRN-U-001',
      description: '[Demo product] Multi-directional training shoe designed for gym workouts, HIIT sessions, and cross-training.',
      features: 'Lateral stability wings • Flat heel drop • Breathable upper • Durable outsole',
      basePriceCentavos: 479500,
      audience: 'UNISEX',
      shoeType: 'TRAINING',
      images: {
        create: [
          { url: '/assets/products/sneaker-men-1.jpg', altText: 'Stridera Cross Trainer Pro', sortOrder: 0, isPrimary: true }
        ]
      },
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '11'].map(size => ({
          variantSku: `STR-TRN-U-001-${size}-GRY`,
          size,
          color: 'Gray/Navy',
          colorHex: '#9E9E9E',
          stockQuantity: 6
        }))
      }
    }
  });

  console.log('✅ Products and variants created');

  // ────────────────────────────────────────────────
  //  4. PROMOTIONS
  // ────────────────────────────────────────────────
  await prisma.promotion.upsert({
    where: { code: 'STRIDE10' },
    update: {},
    create: {
      code: 'STRIDE10',
      description: '10% off your order — welcome discount',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscountCentavos: 50000,
      usageLimit: 100,
      isActive: true
    }
  });

  await prisma.promotion.upsert({
    where: { code: 'LAUNCH500' },
    update: {},
    create: {
      code: 'LAUNCH500',
      description: '₱500 off orders over ₱3,000 — launch promo',
      discountType: 'FLAT',
      discountValue: 50000,
      minOrderCentavos: 300000,
      usageLimit: 50,
      isActive: true
    }
  });

  // ────────────────────────────────────────────────
  //  5. SAMPLE REVIEWS, ORDERS, SHIPMENTS, TICKETS & PAYOUTS
  // ────────────────────────────────────────────────
  const existingReviewCount = await prisma.productReview.count();
  if (existingReviewCount === 0) {
    await prisma.productReview.createMany({
      data: [
        {
          productId: runningMen1.id,
          userId: customer.id,
          orderNumber: 'STR-20261101-DEMO1',
          rating: 5,
          sellerRating: 5,
          comment: 'Incredible cushioning on road runs! Apex Footwear Hub packed and shipped my pair super quickly.'
        },
        {
          productId: sneakerMen1.id,
          userId: customer.id,
          orderNumber: 'STR-20261101-DEMO2',
          rating: 5,
          sellerRating: 5,
          comment: 'Premium leather quality and true to US sizing. Manila Sole Collective is my go-to sneaker seller.'
        }
      ]
    });
  }

  const firstVariant = await prisma.productVariant.findFirst({
    where: { variantSku: 'STR-RUN-M-001-9-BLK' }
  });

  if (firstVariant) {
    const existingDemoOrder = await prisma.order.findUnique({
      where: { orderNumber: 'STR-20261101-DEMO1' }
    });

    if (!existingDemoOrder) {
      const demoOrder = await prisma.order.create({
        data: {
          orderNumber: 'STR-20261101-DEMO1',
          userId: customer.id,
          orderStatus: 'SHIPPED',
          paymentStatus: 'PAID',
          paymentMethod: 'gcash',
          shippingStatus: 'IN_TRANSIT',
          subtotalCentavos: 599500,
          discountTotalCentavos: 0,
          shippingFeeCentavos: 0,
          grandTotalCentavos: 599500,
          shippingFullName: 'Juan Dela Cruz',
          shippingPhone: '+639171111111',
          shippingAddressLine1: '123 Ayala Avenue, Legazpi Village',
          shippingCity: 'Makati',
          shippingProvince: 'Metro Manila',
          shippingPostalCode: '1229',
          shippingCountry: 'PH',
          notes: 'Please call upon arrival at lobby.'
        }
      });

      const demoSellerOrder = await prisma.sellerOrder.create({
        data: {
          orderId: demoOrder.id,
          sellerId: seller.id,
          subtotalCentavos: 599500,
          status: 'SHIPPED',
          carrier: 'STRIDERA Express Courier',
          trackingNumber: 'STR-TRK-882910',
          acceptedAt: new Date(Date.now() - 86400000 * 2),
          shippedAt: new Date(Date.now() - 86400000)
        }
      });

      await prisma.orderItem.create({
        data: {
          orderId: demoOrder.id,
          sellerOrderId: demoSellerOrder.id,
          productVariantId: firstVariant.id,
          productName: 'Stridera Velocity Pro',
          variantSku: firstVariant.variantSku,
          size: firstVariant.size,
          color: firstVariant.color,
          unitPriceCentavos: 599500,
          quantity: 1,
          lineTotalCentavos: 599500
        }
      });

      await prisma.payment.create({
        data: {
          orderId: demoOrder.id,
          provider: 'gcash_sandbox',
          paymentMethod: 'gcash',
          providerPaymentId: 'GCASH-REF-99182736',
          idempotencyKey: 'seed-idemp-demo-001',
          amountCentavos: 599500,
          currency: 'PHP',
          status: 'PAID',
          isDemo: true,
          verifiedAt: new Date(Date.now() - 86400000 * 2),
          financeVerified: true,
          financeVerifiedBy: financeOfficer.email,
          financeVerifiedAt: new Date(Date.now() - 86400000)
        }
      });

      await prisma.shipment.create({
        data: {
          orderId: demoOrder.id,
          sellerOrderId: demoSellerOrder.id,
          deliveryPersonnelId: deliveryPersonnel.id,
          carrier: 'STRIDERA Express Courier',
          trackingNumber: 'STR-TRK-882910',
          status: 'IN_TRANSIT',
          shippingFeeCentavos: 0,
          notes: 'Package collected from Apex Footwear Hub warehouse, en route to Makati hub.',
          acceptedAt: new Date(Date.now() - 86400000),
          collectedAt: new Date(Date.now() - 43200000),
          shippedAt: new Date(Date.now() - 43200000),
          history: {
            events: [
              { status: 'PREPARING', note: 'Order confirmed by seller Apex Footwear Hub', actor: seller.email, timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
              { status: 'ASSIGNED', note: 'Assigned to delivery rider Ramon Bautista', actor: deliveryPersonnel.email, timestamp: new Date(Date.now() - 86400000).toISOString() },
              { status: 'SHIPPED', note: 'Package collected from seller and dispatched (STR-TRK-882910)', actor: deliveryPersonnel.email, timestamp: new Date(Date.now() - 43200000).toISOString() },
              { status: 'IN_TRANSIT', note: 'In transit to Makati delivery zone', actor: deliveryPersonnel.email, timestamp: new Date(Date.now() - 21600000).toISOString() }
            ]
          }
        }
      });

      await prisma.stockMovement.create({
        data: {
          productVariantId: firstVariant.id,
          quantityChange: 20,
          stockAfter: firstVariant.stockQuantity + 1,
          movementType: 'INCOMING',
          reason: 'INITIAL_WAREHOUSE_RECEIPT',
          referenceId: inventoryManager.id
        }
      });

      await prisma.stockMovement.create({
        data: {
          productVariantId: firstVariant.id,
          quantityChange: -1,
          stockAfter: firstVariant.stockQuantity,
          movementType: 'OUTGOING',
          reason: 'CONFIRMED_SALE_STR-20261101-DEMO1',
          referenceId: demoOrder.id
        }
      });

      const ticket = await prisma.supportTicket.create({
        data: {
          ticketNumber: 'TKT-20261101-0001',
          userId: customer.id,
          orderId: demoOrder.id,
          sellerId: seller.id,
          assignedToId: supportPersonnel.id,
          category: 'INQUIRY',
          subject: 'Delivery ETA Inquiry for Order STR-20261101-DEMO1',
          description: 'Hi Support, I would like to confirm if my Stridera Velocity Pro will arrive before Saturday morning for my marathon run.',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          refundStatus: 'NONE',
          messages: {
            create: [
              {
                senderId: customer.id,
                senderRole: 'CUSTOMER',
                senderName: 'Juan Dela Cruz',
                message: 'Hi Support, I would like to confirm if my Stridera Velocity Pro will arrive before Saturday morning for my marathon run.'
              },
              {
                senderId: supportPersonnel.id,
                senderRole: 'CUSTOMER_SUPPORT',
                senderName: 'Clarisse Villanueva (Support)',
                message: 'Hello Juan! Your package (Tracking: STR-TRK-882910) has been collected by our rider Ramon Bautista and is currently IN TRANSIT to Makati. It is scheduled for delivery today!'
              }
            ]
          }
        }
      });

      await prisma.sellerPayout.create({
        data: {
          payoutNumber: 'PAY-20261101-0001',
          sellerId: seller.id,
          grossSalesCentavos: 599500,
          platformFeePercent: 5,
          platformFeeCentavos: 29975,
          netAmountCentavos: 569525,
          provider: 'gcash',
          referenceNumber: 'GCASH-PAYOUT-774102',
          status: 'COMPLETED',
          processedById: financeOfficer.id,
          notes: 'Settled payout for verified order STR-20261101-DEMO1 (5% platform fee deducted).'
        }
      });
    }
  }

  // ────────────────────────────────────────────────
  //  SUMMARY
  // ────────────────────────────────────────────────
  const productCount = await prisma.product.count();
  const variantCount = await prisma.productVariant.count();
  const userCount = await prisma.user.count();

  console.log(`\n🎉 Seed complete!`);
  console.log(`   Users (7 Roles): ${userCount}`);
  console.log(`   Products:        ${productCount}`);
  console.log(`   Variants:        ${variantCount}`);
  console.log(`\n🔑 Demo Role Credentials:`);
  console.log(`   1. Shopper:            demo@stridera.ph / Customer@123!`);
  console.log(`   2. Seller (Approved):  seller@stridera.ph / Seller@123!`);
  console.log(`   2b. Seller #2:         sole@stridera.ph / Seller@123!`);
  console.log(`   3. Administrator:      admin@stridera.ph / Admin@Stridera2024!`);
  console.log(`   4. Inventory Manager:  inventory@stridera.ph / Inventory@123!`);
  console.log(`   5. Delivery Personnel: delivery@stridera.ph / Delivery@123!`);
  console.log(`   6. Customer Support:   support@stridera.ph / Support@123!`);
  console.log(`   7. Finance Officer:    finance@stridera.ph / Finance@123!`);
}

main()
  .catch(e => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
