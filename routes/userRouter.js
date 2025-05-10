import express from 'express';
import {
    signUpUser,
    getUserDetails,
    getAgentProducts
} from '../controllers/userController.js';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// router.post('/addProduct', upload.single('file'), async (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ success: false, error: 'No file uploaded' });
//         }

//         const { agentId, title, description, price, about } = req.body;

//         if (!agentId) {
//             return res.status(400).json({ success: false, error: 'Missing required fields' });
//         }

//         // Resize image using Jimp
//         // const image = await Jimp.read(req.file.buffer);
//         // image.cover({length: 400, width: 400}); // Resize and crop to cover 600x600
//         // const resizedImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

//         const uniqueFileName = `${req.file.originalname}.${req.file.mimetype.split('/')[1]}`;

//         const uploadParams = {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: uniqueFileName,
//             Body: req.file.buffer, // Use the resized image buffer
//             ContentType: req.file.mimetype,
//         };

//         const uploadCommand = new PutObjectCommand(uploadParams);
//         await s3Client.send(uploadCommand);

//         const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

//         try {
//             const product = await Product.create(
//                 { agentId: agentId, image: fileUrl, title: title, description: description, price: price, about: about }
//             );
//             return res.status(200).json({ error: false, result: product });
//         } catch (error) {
//             console.error('Error updating agent logo:', error);
//         }
//     } catch (error) {
//         console.error('S3 Upload Error:', error);
//         res.status(500).json({ success: false, error: 'Failed to upload image' });
//     }
// });

// router.post('/updateProductImage', upload.single('file'), async (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: true, result: 'No file uploaded' });
//         }

//         const { agentId, productId } = req.body;

//         if (!agentId || !productId) {
//             return res.status(400).json({ error: true, result: 'Missing required fields' });
//         }

//         // Resize image using Jimp
//         // const image = await Jimp.read(req.file.buffer);
//         // image.cover({length: 400, width: 400}); // Resize and crop to cover 600x600
//         // const resizedImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

//         const uniqueFileName = `${req.file.originalname}.${req.file.mimetype.split('/')[1]}`;

//         const uploadParams = {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: uniqueFileName,
//             Body: req.file.buffer, // Use the resized image buffer
//             ContentType: req.file.mimetype,
//         };

//         const uploadCommand = new PutObjectCommand(uploadParams);
//         await s3Client.send(uploadCommand);

//         const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

//         try {
//             const product = await Product.findOneAndUpdate(
//                 { _id: productId },
//                 { $set: { image: fileUrl, updatedAt: new Date() } },
//                 { new: true }
//             );
//             return res.status(200).json({ error: false, result: product });
//         } catch (error) {
//             console.error('Error updating product image:', error);
//         }
//     } catch (error) {
//         console.error('S3 Upload Error:', error);
//         res.status(500).json({ error: true, result: 'Failed to upload image' });
//     }
// });

router.post('/signUpUser', async (req, res) => {
    try {
        const { via, handle } = req.body;
        const product = await signUpUser(via, handle);
        return res.status(200).send(product);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).send(error);
    }
});

router.get('/getUserDetails', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await getUserDetails(userId);
        return res.status(200).send(user);
    } catch (error) {
        console.error('Error getting user details:', error);
        res.status(500).send(error);
    }
});

router.get('/getUserOrders', async (req, res) => {
    try {
        const { userId } = req.query;
        const orders = await getUserOrders(userId);
        return res.status(200).send(orders);
    } catch (error) {
        console.error('Error getting user orders:', error);
        res.status(500).send(error);
    }
});

router.get('/getAgentProducts', async (req, res) => {
    try {
        const { agentId } = req.query;
        const products = await getAgentProducts(agentId);
        return res.status(200).send(products);
    } catch (error) {
        console.error('Error getting agent products:', error);
        res.status(500).send(error);
    }
});

export default router; 