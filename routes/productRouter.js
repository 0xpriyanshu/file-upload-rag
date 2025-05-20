import express from 'express';
import {
    getProducts,
    createUserOrder,
    generateOrderId,
    generateProductId,
    pauseProduct,
    addPhysicalProduct,
    updatePhysicalProduct,
    addDigitalProduct,
    updateDigitalProduct,
    addService,
    updateService,
    addEvent,
    updateEvent,
    subscribeOrChangePlan,
    createBillingSession
} from '../controllers/productController.js';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Product from '../models/ProductModel.js';
import OrderModel from '../models/OrderModel.js';
import { sendOrderConfirmationEmail, getAdminEmailByAgentId } from '../utils/emailUtils.js';
import dotenv from 'dotenv';
dotenv.config();
const router = express.Router();
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
import { Jimp } from 'jimp';
const upload = multer({ storage: multer.memoryStorage() });

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

router.post('/addPhysicalProduct', upload.single('file'), async (req, res) => {
    try {
        let images = []
        const { agentId, productId } = req.body;

        if (!agentId) {
            return res.status(400).json({ error: true, result: 'Missing agentId' });
        }
        if (req.file) {

            // Resize image using Jimp
            const image = await Jimp.read(req.file.buffer);
            image.resize({ w: 400, h: 400 }); // Resize and crop to cover 600x600
            const resizedImageBuffer = await image.getBuffer('image/jpeg');

            const uniqueFileName = `${req.file.originalname}`;

            const uploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: uniqueFileName,
                Body: resizedImageBuffer, // Use the resized image buffer
                ContentType: req.file.mimetype,
            };

            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3Client.send(uploadCommand);

            images[0] = (`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`);
        }

        let product = null;
        if (productId) {
            product = await updatePhysicalProduct(productId, req.body, images);
        } else {
            const productId = await generateProductId();
            product = await addPhysicalProduct(req.body, images, productId);
        }
        return res.status(200).send(product);

    } catch (error) {
        console.error('S3 Upload Error:', error);
        res.status(400).json(error);
    }
});

router.post('/addDigitalProduct', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'digitalFile', maxCount: 1 }]), async (req, res) => {
    try {
        let images = []
        let productUrl = ""
        const { agentId } = req.body;

        if (!agentId) {
            return res.status(400).json({ error: true, result: 'Missing agentId' });
        }
        if (req.files.file) {

            // Resize image using Jimp
            const image = await Jimp.read(req.files.file[0].buffer);
            image.resize({ w: 400, h: 400 }); // Resize and crop to cover 600x600
            const resizedImageBuffer = await image.getBuffer('image/jpeg');

            const uniqueFileName = `${req.files.file[0].originalname}`;

            const uploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: uniqueFileName,
                Body: resizedImageBuffer, // Use the resized image buffer
                ContentType: req.files.file[0].mimetype,
            };

            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3Client.send(uploadCommand);

            images[0] = (`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`);
        }

        if (req.body.uploadType === "upload" && req.files.digitalFile) {
            const uniqueFileName = `${req.files.digitalFile[0].originalname}`;

            const uploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: uniqueFileName,
                Body: req.files.digitalFile[0].buffer, // Use the resized image buffer
                ContentType: req.files.digitalFile[0].mimetype,
            };

            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3Client.send(uploadCommand);

            productUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

        }
        else if (req.body.uploadType === "redirect") {
            productUrl = req.body.fileUrl;
        }

        try {

            if (req.body.productId) {
                const product = await updateDigitalProduct(req.body.productId, req.body, images, productUrl);
                return res.status(200).send(product);
            }
            else {
                const productId = await generateProductId();
                const product = await addDigitalProduct(req.body, images, productUrl, productId);
                return res.status(200).send(product);
            }
        } catch (error) {
            throw error;
        }
    } catch (error) {
        console.error('S3 Upload Error:', error);
        res.status(400).json(error);
    }
});


router.post('/addService', upload.single('file'), async (req, res) => {
    try {
        try {

            let images = []
            const { agentId, productId } = req.body;

            if (!agentId) {
                return res.status(400).json({ error: true, result: 'Missing agentId' });
            }
            if (req.file) {

                // Resize image using Jimp
                const image = await Jimp.read(req.file.buffer);
                image.resize({ w: 400, h: 400 }); // Resize and crop to cover 600x600
                const resizedImageBuffer = await image.getBuffer('image/jpeg');

                const uniqueFileName = `${req.file.originalname}`;

                const uploadParams = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: uniqueFileName,
                    Body: resizedImageBuffer, // Use the resized image buffer
                    ContentType: req.file.mimetype,
                };

                const uploadCommand = new PutObjectCommand(uploadParams);
                await s3Client.send(uploadCommand);

                images[0] = (`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`);
            }

            if (productId) {
                const product = await updateService(productId, req.body, images);
                return res.status(200).send(product);
            }
            else {
                const productId = await generateProductId();
                const product = await addService(req.body, productId, images);
                return res.status(200).send(product);
            }
        } catch (error) {
            throw error;
        }
    } catch (error) {
        console.error('S3 Upload Error:', error);
        res.status(400).json(error);
    }
});

router.post('/addEvent', upload.single('file'), async (req, res) => {
    try {
        try {

            let images = []
            const { agentId, productId } = req.body;

            if (!agentId) {
                return res.status(400).json({ error: true, result: 'Missing agentId' });
            }
            if (req.file) {

                // Resize image using Jimp
                const image = await Jimp.read(req.file.buffer);
                image.resize({ w: 400, h: 400 }); // Resize and crop to cover 600x600
                const resizedImageBuffer = await image.getBuffer('image/jpeg');

                const uniqueFileName = `${req.file.originalname}`;

                const uploadParams = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: uniqueFileName,
                    Body: resizedImageBuffer, // Use the resized image buffer
                    ContentType: req.file.mimetype,
                };

                const uploadCommand = new PutObjectCommand(uploadParams);
                await s3Client.send(uploadCommand);

                images[0] = (`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`);
            }

            if (productId) {
                const product = await updateEvent(productId, req.body, images);
                return res.status(200).send(product);
            }
            else {
                const productId = await generateProductId();
                const product = await addEvent(req.body, productId, images);
                return res.status(200).send(product);
            }
        } catch (error) {
            throw error;
        }
    } catch (error) {
        console.error('S3 Upload Error:', error);
        res.status(400).json(error);
    }
});

router.post('/updateProductImage', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: true, result: 'No file uploaded' });
        }

        const { agentId, productId } = req.body;

        if (!agentId || !productId) {
            return res.status(400).json({ error: true, result: 'Missing required fields' });
        }

        // Resize image using Jimp
        const image = await Jimp.read(req.file.buffer);
        image.resize({ w: 400, h: 400 }); // Resize and crop to cover 600x600
        const resizedImageBuffer = await image.getBuffer('image/jpeg');

        const uniqueFileName = `${req.file.originalname}.${req.file.mimetype.split('/')[1]}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: uniqueFileName,
            Body: resizedImageBuffer, // Use the resized image buffer
            ContentType: req.file.mimetype,
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3Client.send(uploadCommand);

        const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

        try {
            const product = await Product.findOneAndUpdate(
                { _id: productId },
                { $set: { image: fileUrl, updatedAt: new Date() } },
                { new: true }
            );
            return res.status(200).json({ error: false, result: product });
        } catch (error) {
            console.error('Error updating product image:', error);
        }
    } catch (error) {
        console.error('S3 Upload Error:', error);
        res.status(500).json({ error: true, result: 'Failed to upload image' });
    }
});


router.delete('/deleteProduct', async (req, res) => {
    try {
        const { productId } = req.body;
        await Product.findByIdAndDelete(productId);
        return res.status(200).json({ error: false, result: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: true, result: 'Failed to delete product' });
    }
});

router.get('/getProducts', async (req, res) => {
    try {
        const { agentId } = req.query;
        const products = await getProducts(agentId);
        return res.status(200).json({ error: false, result: products });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ error: true, result: 'Failed to get products' });
    }
});


router.post("/create-payment-intent", async (req, res) => {
    try {
        let { amount, agentId, userId, cart, stripeAccountId, currency, userEmail } = req.body;

        if (!amount || !agentId || !userId || !cart || !stripeAccountId || !currency || !userEmail) {
            throw { message: "Missing required fields" }
        }
        const orderId = await generateOrderId();
        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: amount,
                currency: currency,
                automatic_payment_methods: {
                    enabled: true,
                }
            },
            {
                stripeAccount: stripeAccountId,
            }
        );

        await createUserOrder({
            paymentId: paymentIntent.id,
            paymentStatus: paymentIntent.status,
            totalAmount: amount,
            currency: currency,
            items: cart,
            userId: userId,
            orderId: orderId,
            paymentMethod: "FIAT",
            agentId: agentId,
            userEmail: userEmail,
        });
        res.json({
            error: false,
            clientSecret: paymentIntent.client_secret
        });
    }
    catch (error) {
        return res.status(400).json(error);
    }
});

router.post("/pauseProduct", async (req, res) => {
    try {
        const { productId, isPaused } = req.body;
        const product = await pauseProduct(productId, isPaused);
        return res.status(200).send(product);
    } catch (error) {
        console.error('Error pausing product:', error);
        res.status(500).send(error);
    }
});

router.post("/send-order-email", async (req, res) => {
    console.log("Received order email request:", req.body);
    try {
      const { paymentIntentId, userEmail, userName, agentId } = req.body;
      
      if (!paymentIntentId || !userEmail) {
        return res.status(400).json({ 
          error: true, 
          message: "Missing required information" 
        });
      }
      
      const order = await OrderModel.findOne({ paymentId: paymentIntentId });
      console.log("Order lookup result:", order ? "Found" : "Not found", "for payment ID:", paymentIntentId);
      
      if (!order) {
        return res.status(404).json({ error: true, message: "Order not found" });
      }
      
      if (order.paymentStatus !== 'succeeded') {
        await OrderModel.findByIdAndUpdate(
          order._id, 
          { 
            paymentStatus: 'succeeded',
            status: 'PROCESSING'
          }
        );
      }
      
      const adminEmail = await getAdminEmailByAgentId(order.agentId || agentId);
      
      await sendOrderConfirmationEmail({
        email: userEmail,
        adminEmail,
        name: userName || "Customer",
        items: order.items || [],
        totalAmount: order.totalAmount,
        orderId: order.orderId,
        paymentId: paymentIntentId,
        paymentMethod: "Credit Card",
        paymentDate: new Date().toLocaleDateString(),
        currency: order.currency,
        agentId: order.agentId || agentId 
      });
      
      return res.status(200).json({ 
        error: false, 
        message: "Order confirmation email sent" 
      });
    } catch (error) {
        console.error("Error sending order confirmation email:", error);
        return res.status(500).json({
            error: true,
            message: "Failed to send order confirmation email",
            details: error.message
        });
    }
});

router.post('/subscribeOrChangePlan', express.json(), async (req, res) => {
    try {
        const { clientId, planId } = req.body;

        if (!clientId || !planId) {
            throw { message: "Missing required fields" }
        }

        // const subscription = await Subscription.findOne({ customerId: clientId });
        const url = await subscribeOrChangePlan(clientId, planId);

        // res.redirect(303, url);
        res.status(200).json({ error: false, result: url });
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get('/createBillingSession', express.json(), async (req, res) => {
    // For demonstration purposes, we're using the Checkout session to retrieve the customer ID.
    // Typically this is stored alongside the authenticated user in your database.
    const { clientId } = req.query;
    // const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);

    // This is the url to which the customer will be redirected when they're done
    // managing their billing with the portal.
    const url = await createBillingSession(clientId);

    res.status(200).json({ error: false, result: url });
});


export default router; 