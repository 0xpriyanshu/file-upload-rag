import express from 'express';
import {
    addProduct,
    updateProduct,
    getProducts,
    createUserOrder,
    generateOrderId,
    generateProductId
} from '../controllers/productController.js';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import Product from '../models/ProductModel.js';
import dotenv from 'dotenv';
dotenv.config();
const router = express.Router();
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const upload = multer({ storage: multer.memoryStorage() });

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

router.post('/addProduct', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'digitalFile', maxCount: 1 }]), async (req, res) => {
    try {
        let images = []
        let productUrl = ""
        const { agentId } = req.body;

        if (!agentId) {
            return res.status(400).json({ error: true, result: 'Missing agentId' });
        }
        if (req.files.file) {

            // Resize image using Jimp
            // const image = await Jimp.read(req.file.buffer);
            // image.cover({length: 400, width: 400}); // Resize and crop to cover 600x600
            // const resizedImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            const uniqueFileName = `${req.files.file[0].originalname}`;

            const uploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: uniqueFileName,
                Body: req.files.file[0].buffer, // Use the resized image buffer
                ContentType: req.files.file[0].mimetype,
            };

            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3Client.send(uploadCommand);

            images.push(`https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`);
        }

        if (req.body.type === "digital") {

            if (req.body.uploadType === "upload") {
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

        }

        try {

            const productId = await generateProductId();
            const product = await addProduct(req.body, images, productUrl, productId);
            return res.status(200).send(product);
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
        // const image = await Jimp.read(req.file.buffer);
        // image.cover({length: 400, width: 400}); // Resize and crop to cover 600x600
        // const resizedImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        const uniqueFileName = `${req.file.originalname}.${req.file.mimetype.split('/')[1]}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: uniqueFileName,
            Body: req.file.buffer, // Use the resized image buffer
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

router.put('/updateProduct', async (req, res) => {
    try {
        const updatedData = req.body;
        const productId = updatedData.productId;
        delete updatedData.productId;
        updatedData.updatedAt = new Date();
        const product = await updateProduct(updatedData, productId);
        return res.status(200).json({ error: false, result: product });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: true, result: 'Failed to update product' });
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



export default router; 