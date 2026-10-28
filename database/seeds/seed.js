// STRIDERA — Database Seed Script
// Run: node database/seeds/seed.js
// All products use source/ product images. Demo data is clearly labeled.

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding STRIDERA database...\n');

  // ────────────────────────────────────────────────
  //  1. CATEGORIES
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
        name: 'Lifestyle',
        slug: 'lifestyle',
        description: 'Everyday sneakers that blend style and comfort for any occasion.',
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
        imageUrl: null,
        sortOrder: 3
      }
    }),
    prisma.category.upsert({
      where: { slug: 'training' },
      update: {},
      create: {
        name: 'Training',
        slug: 'training',
        description: '[Demo] Versatile training shoes for gym and cross-training workouts.',
        imageUrl: null,
        sortOrder: 4
      }
    })
  ]);

  const [running, lifestyle, basketball, training] = categories;
  console.log('✅ Categories created');

  // ────────────────────────────────────────────────
  //  2. ADMIN USER
  // ────────────────────────────────────────────────
  const adminPasswordHash = await argon2.hash('Admin@Stridera2024!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@stridera.ph' },
    update: {},
    create: {
      email: 'admin@stridera.ph',
      passwordHash: adminPasswordHash,
      firstName: 'STRIDERA',
      lastName: 'Admin',
      role: 'ADMIN',
      phone: '+639000000000'
    }
  });

  // Demo customer
  const customerPasswordHash = await argon2.hash('Customer@123!');
  const customer = await prisma.user.upsert({
    where: { email: 'demo@stridera.ph' },
    update: {},
    create: {
      email: 'demo@stridera.ph',
      passwordHash: customerPasswordHash,
      firstName: 'Demo',
      lastName: 'Customer',
      role: 'CUSTOMER',
      phone: '+639111111111',
      addresses: {
        create: {
          label: 'Home',
          fullName: 'Demo Customer',
          phone: '+639111111111',
          addressLine1: '123 Rizal Street',
          city: 'Makati',
          province: 'Metro Manila',
          postalCode: '1200',
          country: 'PH',
          isDefault: true
        }
      }
    }
  });

  // Approved Demo Seller
  const sellerPasswordHash = await argon2.hash('Seller@123!');
  const seller = await prisma.user.upsert({
    where: { email: 'seller@stridera.ph' },
    update: {},
    create: {
      email: 'seller@stridera.ph',
      passwordHash: sellerPasswordHash,
      firstName: 'Apex',
      lastName: 'Merchant',
      role: 'SELLER',
      sellerStatus: 'APPROVED',
      storeName: 'Apex Footwear Hub',
      storeDescription: 'Authorized vendor for high-performance athletic footwear in Metro Manila.',
      phone: '+639222222222'
    }
  });

  // Pending Demo Seller (for testing approval flow)
  const pendingSeller = await prisma.user.upsert({
    where: { email: 'pending.seller@stridera.ph' },
    update: {},
    create: {
      email: 'pending.seller@stridera.ph',
      passwordHash: sellerPasswordHash,
      firstName: 'Stride',
      lastName: 'Applicant',
      role: 'SELLER',
      sellerStatus: 'PENDING',
      storeName: 'Stride Dynamics PH',
      storeDescription: 'Custom and lifestyle sneakers seeking platform approval.',
      phone: '+639333333333'
    }
  });

  // ────────────────────────────────────────────────
  //  2.1 BRANDS
  // ────────────────────────────────────────────────
  const brandOfficial = await prisma.brand.upsert({
    where: { slug: 'stridera-lab' },
    update: {},
    create: {
      name: 'STRIDERA Lab',
      slug: 'stridera-lab',
      description: 'Official flagship performance footwear line designed by STRIDERA.',
      logoUrl: '/assets/logo/stridera-logo.png',
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
      sellerId: seller.id,
      isActive: true
    }
  });

  console.log('✅ Users & Brands created');

  // ────────────────────────────────────────────────
  //  3. RUNNING PRODUCTS (Men)
  // ────────────────────────────────────────────────

  const runningMen1 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-M-001' },
    update: {},
    create: {
      categoryId: running.id,
      brandId: brandOfficial.id,
      name: 'Stridera Velocity Pro',
      slug: 'stridera-velocity-pro',
      sku: 'STR-RUN-M-001',
      description: 'Built for serious runners who demand peak performance. The Velocity Pro delivers explosive energy return and adaptive cushioning for every stride.',
      features: 'Lightweight mesh upper • Energy-return foam midsole • Stridera Grip outsole • Breathable lining • Reinforced heel counter',
      basePriceCentavos: 599500,  // ₱5,995.00
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
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12'].flatMap(size =>
          [
            { variantSku: `STR-RUN-M-001-${size}-BLK`, size, color: 'Black/Teal', colorHex: '#0D1117', stockQuantity: size === '9' || size === '10' ? 3 : 8 },
            { variantSku: `STR-RUN-M-001-${size}-LIM`, size, color: 'Black/Lime', colorHex: '#C8E047', stockQuantity: 5 }
          ]
        )
      }
    }
  });

  const runningMen2 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-M-002' },
    update: {},
    create: {
      categoryId: running.id,
      sellerId: seller.id,
      brandId: brandApex.id,
      name: 'Stridera Max Energy X',
      slug: 'stridera-max-energy-x',
      sku: 'STR-RUN-M-002',
      description: 'Maximum energy return for long-distance training. The Max Energy X features a dual-layer midsole and carbon-fiber plate for elite performance.',
      features: 'Engineered knit upper • Carbon-fiber propulsion plate • Dual-density midsole • Wide toe box • Anti-slip outsole',
      basePriceCentavos: 749500,  // ₱7,495.00
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
        create: ['7', '8', '9', '10', '11', '12'].flatMap(size =>
          [{ variantSku: `STR-RUN-M-002-${size}-NVY`, size, color: 'Navy/White', colorHex: '#1A3A6B', stockQuantity: 6 }]
        )
      }
    }
  });

  // ────────────────────────────────────────────────
  //  4. RUNNING PRODUCTS (Women)
  // ────────────────────────────────────────────────

  const runningWomen1 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-W-001' },
    update: {},
    create: {
      categoryId: running.id,
      name: 'Stridera Stride Fusion',
      slug: 'stridera-stride-fusion',
      sku: 'STR-RUN-W-001',
      description: 'The Stride Fusion is engineered for women who run with purpose. MAX ENERGY technology provides responsive cushioning from first step to finish line.',
      features: 'Adaptive knit upper • MAX ENERGY foam • Soft heel collar • Flex grooves • Stridera outsole pattern',
      basePriceCentavos: 549500,  // ₱5,495.00
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
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10'].flatMap(size =>
          [
            { variantSku: `STR-RUN-W-001-${size}-CRM`, size, color: 'Cream/Pink', colorHex: '#F5E6D3', stockQuantity: 7 },
            { variantSku: `STR-RUN-W-001-${size}-MNT`, size, color: 'Mint/White', colorHex: '#B5E8D5', stockQuantity: 5 }
          ]
        )
      }
    }
  });

  const runningWomen2 = await prisma.product.upsert({
    where: { sku: 'STR-RUN-W-002' },
    update: {},
    create: {
      categoryId: running.id,
      name: 'Stridera Aero Flow',
      slug: 'stridera-aero-flow',
      sku: 'STR-RUN-W-002',
      description: 'Ultra-lightweight design meets premium cushioning in the Aero Flow. Designed for daily training runs with breathable upper and durable outsole.',
      features: 'Perforated mesh upper • Lightweight EVA midsole • Padded collar • Reflective details • Flexible outsole',
      basePriceCentavos: 499500,  // ₱4,995.00
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
        create: ['7', '7.5', '8', '8.5', '9', '10'].flatMap(size =>
          [{ variantSku: `STR-RUN-W-002-${size}-PNK`, size, color: 'Pink/White', colorHex: '#F4A0B5', stockQuantity: 6 }]
        )
      }
    }
  });

  // ────────────────────────────────────────────────
  //  5. LIFESTYLE PRODUCTS (Men)
  // ────────────────────────────────────────────────

  const sneakerMen1 = await prisma.product.upsert({
    where: { sku: 'STR-LST-M-001' },
    update: {},
    create: {
      categoryId: lifestyle.id,
      name: 'Stridera Heritage Classic',
      slug: 'stridera-heritage-classic',
      sku: 'STR-LST-M-001',
      description: 'Timeless design meets modern comfort. The Heritage Classic features premium leather construction with Stridera\'s signature gold logo accent.',
      features: 'Full-grain leather upper • Gold Stridera logo • Gum rubber outsole • Memory foam insole • Classic lace-up closure',
      basePriceCentavos: 699500,  // ₱6,995.00
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
        create: ['7', '8', '9', '10', '11', '12'].flatMap(size =>
          [
            { variantSku: `STR-LST-M-001-${size}-BRN`, size, color: 'Brown/Gum', colorHex: '#8B6914', stockQuantity: 4 },
            { variantSku: `STR-LST-M-001-${size}-TAN`, size, color: 'Tan/White', colorHex: '#C4A265', stockQuantity: 3 }
          ]
        )
      }
    }
  });

  // ────────────────────────────────────────────────
  //  6. LIFESTYLE PRODUCTS (Women)
  // ────────────────────────────────────────────────

  const sneakerWomen1 = await prisma.product.upsert({
    where: { sku: 'STR-LST-W-001' },
    update: {},
    create: {
      categoryId: lifestyle.id,
      name: 'Stridera Cloud Step',
      slug: 'stridera-cloud-step',
      sku: 'STR-LST-W-001',
      description: 'The Cloud Step combines clean white leather with the iconic Stridera blue "S" and a pop of orange — a signature look for the modern woman.',
      features: 'White leather upper • Stridera blue S logo • Orange accent tab • Cushioned insole • Vulcanized outsole',
      basePriceCentavos: 549500,  // ₱5,495.00
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
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10'].flatMap(size =>
          [
            { variantSku: `STR-LST-W-001-${size}-WHT`, size, color: 'White/Blue', colorHex: '#FFFFFF', stockQuantity: 6 },
            { variantSku: `STR-LST-W-001-${size}-CRM`, size, color: 'Cream/Orange', colorHex: '#FFF3E0', stockQuantity: 4 }
          ]
        )
      }
    }
  });

  const sneakerWomen2 = await prisma.product.upsert({
    where: { sku: 'STR-LST-W-002' },
    update: {},
    create: {
      categoryId: lifestyle.id,
      name: 'Stridera Soft Walk',
      slug: 'stridera-soft-walk',
      sku: 'STR-LST-W-002',
      description: 'All-day comfort in a sleek, minimal silhouette. The Soft Walk is crafted for effortless style from morning coffee to evening walks.',
      features: 'Soft leather upper • Padded ankle collar • Flexible sole • Signature Stridera stitching • Easy slip-on design',
      basePriceCentavos: 449500,  // ₱4,495.00
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
        create: ['7', '7.5', '8', '8.5', '9', '10'].flatMap(size =>
          [
            { variantSku: `STR-LST-W-002-${size}-BLK`, size, color: 'Black', colorHex: '#111111', stockQuantity: 5 },
            { variantSku: `STR-LST-W-002-${size}-WHT`, size, color: 'White', colorHex: '#FFFFFF', stockQuantity: 4 }
          ]
        )
      }
    }
  });

  // ────────────────────────────────────────────────
  //  7. DEMO — Basketball & Training (no source images)
  // ────────────────────────────────────────────────

  await prisma.product.upsert({
    where: { sku: 'STR-BSK-M-001' },
    update: {},
    create: {
      categoryId: basketball.id,
      name: '[Demo] Stridera Court Dominator',
      slug: 'stridera-court-dominator',
      sku: 'STR-BSK-M-001',
      description: '[Demo product — no source image] High-top basketball shoe with superior ankle support, cushioned midsole, and herringbone grip pattern for explosive court play.',
      features: 'Reinforced ankle collar • Responsive cushioning • Herringbone outsole • Lockdown lacing system',
      basePriceCentavos: 649500,  // ₱6,495.00
      audience: 'MEN',
      shoeType: 'BASKETBALL',
      variants: {
        create: ['7', '8', '9', '10', '11', '12'].map(size => ({
          variantSku: `STR-BSK-M-001-${size}-BLK`,
          size, color: 'Black/Red', colorHex: '#1A1A1A',
          stockQuantity: 5
        }))
      }
    }
  });

  await prisma.product.upsert({
    where: { sku: 'STR-TRN-U-001' },
    update: {},
    create: {
      categoryId: training.id,
      name: '[Demo] Stridera Cross Trainer Pro',
      slug: 'stridera-cross-trainer-pro',
      sku: 'STR-TRN-U-001',
      description: '[Demo product — no source image] Multi-directional training shoe designed for gym workouts, HIIT sessions, and cross-training.',
      features: 'Lateral stability wings • Flat heel drop • Breathable upper • Durable outsole',
      basePriceCentavos: 479500,  // ₱4,795.00
      audience: 'UNISEX',
      shoeType: 'TRAINING',
      variants: {
        create: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '11'].map(size => ({
          variantSku: `STR-TRN-U-001-${size}-GRY`,
          size, color: 'Gray/Navy', colorHex: '#9E9E9E',
          stockQuantity: 6
        }))
      }
    }
  });

  console.log('✅ Products and variants created');

  // ────────────────────────────────────────────────
  //  8. PROMOTIONS
  // ────────────────────────────────────────────────

  await prisma.promotion.upsert({
    where: { code: 'STRIDE10' },
    update: {},
    create: {
      code: 'STRIDE10',
      description: '10% off your order — welcome discount',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscountCentavos: 50000,  // Max ₱500 off
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
      discountValue: 50000,  // ₱500
      minOrderCentavos: 300000,  // min ₱3,000
      usageLimit: 50,
      isActive: true
    }
  });

  console.log('✅ Promotions created');

  // ────────────────────────────────────────────────
  //  SUMMARY
  // ────────────────────────────────────────────────
  const productCount = await prisma.product.count();
  const variantCount = await prisma.productVariant.count();
  const imageCount = await prisma.productImage.count();

  console.log(`\n🎉 Seed complete!`);
  console.log(`   Products: ${productCount}`);
  console.log(`   Variants: ${variantCount}`);
  console.log(`   Images: ${imageCount}`);
  console.log(`\n🔑 Admin login: admin@stridera.ph / Admin@Stridera2024!`);
  console.log(`   Demo customer: demo@stridera.ph / Customer@123!`);
  console.log(`   Demo seller (approved): seller@stridera.ph / Seller@123!`);
  console.log(`   Demo seller (pending): pending.seller@stridera.ph / Seller@123!`);
}

main()
  .catch(e => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
