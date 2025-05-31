import Product from "../models/ProductModel.js";
import UserModel from "../models/User.js";
import OrderModel from "../models/OrderModel.js";
import ClientModel from "../models/ClientModel.js";
import Subscription from "../models/Subscriptions.js";
import Agent from "../models/AgentModel.js";
import Invoice from "../models/Invoice.js";
import { Stripe } from "stripe";
import config from "../config.js";
import { getAdminEmailByAgentId, sendOrderConfirmationEmail } from "../utils/emailUtils.js";
import EmailTemplates from "../models/EmailTemplates.js";
const stripe = new Stripe(config.STRIPE_SECRET_KEY);

const successMessage = async (data) => {
    const returnData = {};
    returnData["error"] = false;
    returnData["result"] = data;

    return returnData;
};

const errorMessage = async (data) => {
    const returnData = {};
    returnData["error"] = true;
    returnData["result"] = data;

    return returnData;
};

export const addPhysicalProduct = async (body, images, productId) => {
    try {
        body.inventory = 0;
        body.variedQuantities = JSON.parse(body.variedQuantities);
        if (body.quantityUnlimited == false) {
            if (body.variedQuantities) {
                let inventory = 0;
                for (let size in body.variedQuantities) {
                    inventory += body.variedQuantities[size];
                }
                body.inventory = inventory;
            }
            else {
                body.inventory = body.quantity;
            }
        }
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        const product = await Product.create({
            ...body,
            images: images,
            productId: productId
        });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const updatePhysicalProduct = async (productId, body, images) => {
    try {
        body.inventory = 0;
        body.variedQuantities = JSON.parse(body.variedQuantities);
        if (body.quantityUnlimited == false) {
            if (body.variedQuantities) {
                let inventory = 0;
                for (let size in body.variedQuantities) {
                    inventory += body.variedQuantities[size];
                }
                body.inventory = inventory;
            }
            else {
                body.inventory = body.quantity;
            }
        }
        if (images.length == 0) {
            images = body.images;
        }
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        delete body.productId;
        const product = await Product.findOneAndUpdate({ productId: Number(productId) }, {
            $set: {
                ...body,
                images: images,
            }
        }, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const addDigitalProduct = async (body, images, productUrl, productId) => {
    try {
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        body.inventory = 0;
        if (body.quantityUnlimited == false) {
            body.inventory = body.quantity;
        }
        const product = await Product.create({
            ...body,
            images: images,
            fileUrl: productUrl,
            productId: productId
        });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const updateDigitalProduct = async (productId, body, images, productUrl) => {
    try {
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        if (images.length == 0) {
            images = body.images;
        }
        body.inventory = 0;
        if (body.quantityUnlimited == false) {
            body.inventory = body.quantity;
        }
        if (productUrl) {
            body.fileUrl = productUrl;
            body.fileName = productUrl.split('/').pop()
        }
        delete body.productId;
        const product = await Product.findOneAndUpdate({ productId: productId }, {
            $set: {
                ...body,
                images: images,
            }
        }, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const addService = async (body, productId, images) => {
    try {
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        body.inventory = 0;
        if (body.quantityUnlimited == false) {
            body.inventory = body.quantity;
        }
        const product = await Product.create({
            ...body,
            images: images,
            productId: productId
        });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const updateService = async (productId, body, images) => {
    try {
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        if (images.length == 0) {
            images = body.images;
        }
        body.inventory = 0;
        if (body.quantityUnlimited == false) {
            body.inventory = body.quantity;
        }
        delete body.productId;
        const product = await Product.findOneAndUpdate({ productId: productId }, {
            $set: {
                ...body,
                images: images,
            }
        }, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const addEvent = async (body, productId, images) => {
    try {
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        if (body.slots) {
            const slots = JSON.parse(body.slots);
            let inventory = 0;
            for (let slot of slots) {
                if (slot.seatType === 'limited') {
                    inventory += slot.seats;
                }
            }
            body.inventory = inventory;
        }
        body.slots = slots
        const product = await Product.create({
            ...body,
            images: images,
            productId: productId
        });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const updateEvent = async (productId, body, images) => {
    try {
        if (body.checkOutCustomerDetails) {
            body.checkOutCustomerDetails = JSON.parse(body.checkOutCustomerDetails);
        }
        if (images.length == 0) {
            images = body.images;
        }
        const slots = JSON.parse(body.slots);
        let inventory = 0;
        for (let slot of slots) {
            if (slot.seatType === 'limited') {
                inventory += slot.seats;
            }
        }
        body.inventory = inventory;
        body.slots = slots
        delete body.productId;
        const product = await Product.findOneAndUpdate({ productId: productId }, {
            $set: {
                ...body,
                images: images,
            }
        }, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};


export const getProducts = async (agentId) => {
    const products = await Product.find({ agentId: agentId });
    return products;
};

export const pauseProduct = async (productId, isPaused) => {
    try {
        const product = await Product.findOneAndUpdate({ _id: productId }, { isPaused: isPaused }, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
}

export const canPlaceOrder = async (checkType, checkQuantity, productId) => {
    try {
        const product = await Product.findOne({ productId: productId });
        if (!product) {
            throw {
                message: "Product not found",
            };
        }
        if (product.isPaused) {
            throw {
                message: "Product is paused",
            };
        }

        if (product.type === "physicalProduct") {
            if (checkType === "") {
                if (product.quantityUnlimited == false && product.quantity < checkQuantity) {
                    throw {
                        message: "Quantity is not available",
                    };
                }
            }
            else if (product.variedQuantities[checkType] < checkQuantity) {
                throw {
                    message: "Quantity is not available",
                };
            }
        }

        else if (product.type === "Event") {
            let slot = product.slots.find(slot => slot.start === checkType);
            if (!slot) {
                throw {
                    message: "Slot not found",
                };
            }
            if (slot.seatType === 'limited' && slot.seats < checkQuantity) {
                throw {
                    message: "Quantity is not available",
                };
            }
        }

        else if (product.type === "digitalProduct") {
            if (product.quantityUnlimited == false && product.quantity < checkQuantity) {
                throw {
                    message: "Quantity is not available",
                };
            }
        }

        return true

    } catch (err) {
        throw await errorMessage(err.message);
    }
}

export const createUserOrder = async (body, checkType, checkQuantity) => {
    try {
        let userData = await UserModel.findOne({
            "_id": body.userId,
        });
        if (!userData) {
            throw {
                message: "User not found",
            };
        }
        const order = await OrderModel.create({
            user: userData._id,
            items: body.items,
            orderId: body.orderId,
            totalAmount: body.totalAmount,
            currency: body.currency.toUpperCase(),
            paymentStatus: body.paymentStatus,
            paymentId: body.paymentId,
            agentId: body.agentId,
            status: "PROCESSING",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            userEmail: body.userEmail,
            shipping: body.shipping
        });

        if (body.shipping.saveDetails) {
            delete body.shipping.saveDetails;
            await UserModel.findOneAndUpdate({ _id: body.userId }, { $set: { shipping: body.shipping } });
        }

        if (checkType != null) {
            if (body.items[0].type === "physicalProduct" && body.items[0].quantityUnlimited == false) {
                let update = {}
                if (body.items[0].quantityType === "oneSize") {
                    update[`quantity`] = -checkQuantity
                }
                else {
                    update[`variedQuantities.${checkType}`] = -checkQuantity
                }
                await Product.findOneAndUpdate({ productId: body.items[0].productId }, { $inc: update });
            }
            else if (body.items[0].type === "Event") {
                let slot = body.items[0].slots.find(slot => slot.start === checkType);
                if (slot.seatType === 'limited') {
                    await Product.findOneAndUpdate({ productId: body.items[0].productId, "slots.start": checkType }, { $inc: { "slots.$.seats": -checkQuantity } });
                }
            }
            else if (body.items[0].type === "digitalProduct" && body.items[0].quantityUnlimited == false) {
                await Product.findOneAndUpdate({ productId: body.items[0].productId }, { $inc: { quantity: -checkQuantity } });
            }
        }
        return await successMessage(true);
    } catch (err) {
        throw await errorMessage(err.message);
    }
}

export const createUserBookingOrder = async (body) => {
    try {
        let userData = await UserModel.findOne({
            "_id": body.userId,
        });
        if (!userData) {
            throw {
                message: "User not found",
            };
        }
        const order = await OrderModel.create({
            user: userData._id,
            items: body.items,
            orderId: body.orderId,
            totalAmount: body.totalAmount,
            currency: body.currency.toUpperCase(),
            paymentStatus: body.paymentStatus,
            paymentId: body.paymentId,
            agentId: body.agentId,
            status: "PROCESSING",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            userEmail: body.userEmail,
            shipping: body.shipping
        });

        if (body.shipping.saveDetails) {
            delete body.shipping.saveDetails;
            await UserModel.findOneAndUpdate({ _id: body.userId }, { $set: { shipping: body.shipping } });
        }

        return await successMessage(true);
    } catch (err) {
        throw await errorMessage(err.message);
    }
}

export const createUserFreeProductOrder = async (body) => {
    try {
        let userData = await UserModel.findOne({
            "_id": body.userId,
        });
        if (!userData) {
            throw {
                message: "User not found",
            };
        }
        const order = await OrderModel.create({
            user: userData._id,
            items: body.items,
            orderId: body.orderId,
            totalAmount: body.totalAmount,
            currency: body.currency.toUpperCase(),
            paymentStatus: body.paymentStatus,
            paymentId: body.paymentId,
            agentId: body.agentId,
            status: "COMPLETED",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            userEmail: body.userEmail,
            shipping: body.shipping
        });

        if (body.shipping.saveDetails) {
            delete body.shipping.saveDetails;
            await UserModel.findOneAndUpdate({ _id: body.userId }, { $set: { shipping: body.shipping } });
        }

        const typeToTemplateKey = {
            'physicalProduct': 'physicalProduct',
            'digitalProduct': 'digitalProduct',
            'Event': 'Event_Booking_Confirmation',
            'Service': 'Service'
        };

        const itemType = order.items[0].type;
        const templateKey = typeToTemplateKey[itemType];

        console.log("Item type:", itemType, "Template key:", templateKey);

        if (!templateKey) {
            console.error("Unknown product type:", itemType);
            return true;
        }

        const emailTemplates = await EmailTemplates.findOne({ agentId: order.agentId });

        if (!emailTemplates) {
            console.error("No email templates found for agentId:", order.agentId);
            return true;
        }

        console.log("Email templates found, checking for template:", templateKey);

        const customerName = 'Valued Customer';

        let orderDetails = {
            email: order.userEmail,
            adminEmail: await getAdminEmailByAgentId(order.agentId),
            name: customerName,
            items: order.items,
            totalAmount: order.totalAmount,
            orderId: order.orderId,
            paymentMethod: order.paymentMethod || 'Credit Card',
            paymentDate: order.createdAt,
            currency: order.currency,
            agentId: order.agentId
        };

        console.log("Sending email with details:", {
            email: orderDetails.email,
            orderId: orderDetails.orderId,
            productType: itemType
        });

        await sendOrderConfirmationEmail(orderDetails);

        return await successMessage(order);

    } catch (err) {
        throw await errorMessage(err.message);
    }
}


export const generateOrderId = async () => {
    return await OrderModel.generateOrderId();
}

export const generateProductId = async () => {
    return await Product.generateProductId();
}


export const updateUserOrder = async (paymentId, paymentStatus, status) => {
    try {
        const order = await OrderModel.findOneAndUpdate(
            { paymentId: paymentId },
            { paymentStatus: paymentStatus, status: status },
            { new: true }
        ).populate('user');

        if (!order) {
            console.error("Order not found for paymentId:", paymentId);
            return false;
        }

        console.log("Order found:", order.orderId);

        if (paymentStatus == 'succeeded') {
            const typeToTemplateKey = {
                'physicalProduct': 'physicalProduct',
                'digitalProduct': 'digitalProduct',
                'Event': 'Event_Booking_Confirmation',
                'Service': 'Service'
            };

            const itemType = order.items[0].type;
            const templateKey = typeToTemplateKey[itemType];

            console.log("Item type:", itemType, "Template key:", templateKey);

            if (!templateKey) {
                console.error("Unknown product type:", itemType);
                return true;
            }

            const emailTemplates = await EmailTemplates.findOne({ agentId: order.agentId });

            if (!emailTemplates) {
                console.error("No email templates found for agentId:", order.agentId);
                return true;
            }

            console.log("Email templates found, checking for template:", templateKey);

            const customerName = 'Valued Customer';

            let orderDetails = {
                email: order.userEmail,
                adminEmail: await getAdminEmailByAgentId(order.agentId),
                name: customerName,
                items: order.items,
                totalAmount: order.totalAmount,
                orderId: order.orderId,
                paymentMethod: order.paymentMethod || 'Credit Card',
                paymentDate: order.createdAt,
                currency: order.currency,
                agentId: order.agentId
            };

            console.log("Sending email with details:", {
                email: orderDetails.email,
                orderId: orderDetails.orderId,
                productType: itemType
            });

            const email = await sendOrderConfirmationEmail(orderDetails);
            console.log("Email sending result:", email);
        }

        return true;
    } catch (err) {
        console.error("Error in updateUserOrder:", err);
        throw await errorMessage(err.message);
    }
}


export const subscribeOrChangePlan = async (clientId, planId) => {
    try {

        const client = await ClientModel.findOne({ _id: clientId });
        if (!client) {
            throw {
                message: "Client not found",
            };
        }

        const subscription = await Subscription.findOne({ customerId: client.stripeCustomerId });

        const plans = config.PLANS
        const plan = plans.find(plan => plan.id === planId);
        if (!plan) {
            throw {
                message: "Plan not found",
            };
        }

        if (plan.name == client.planId) {
            throw {
                message: "Client already has this plan",
            };
        }
        let customerId
        if (client.stripeCustomerId == "") {
            const customer = await stripe.customers.create({
                email: client.signUpVia.handle,
            });
            customerId = customer.id;
        } else {
            customerId = client.stripeCustomerId;
        }
        if (!subscription) {
            const prices = await stripe.prices.list({
                lookup_keys: [plan.lookupKey],
                expand: ['data.product'],
            });

            const session = await stripe.checkout.sessions.create({
                billing_address_collection: 'auto',
                customer: customerId,
                line_items: [
                    {
                        price: prices.data[0].id,
                        // For metered billing, do not pass quantity
                        quantity: 1,

                    },
                ],
                mode: 'subscription',
                success_url: `${process.env.FRONTEND_URL}/admin/payment-success`,
                cancel_url: `${process.env.FRONTEND_URL}/admin/payment-cancel`,
            });

            const sessionUrl = session.url;
            return { isUrl: true, message: sessionUrl };
        } else {
            //check if latest invoice is paid
            const subscriptions = await stripe.subscriptions.list({
                customer: customerId,
            });

            const subscription = await Subscription.findOne({ customerId: customerId });
            const latestInvoiceId = subscription.subscriptionDetails.latest_invoice;
            const latestInvoice = await stripe.invoices.retrieve(latestInvoiceId);
            const currentPlan = plans.find(p => p.name === client.planId);
            if (plan.agentLimit < currentPlan.agentLimit) {
                const agents = await Agent.find({ clientId: clientId });
                if (agents.length > plan.agentLimit) {
                    throw {
                        message: `Please delete ${agents.length - plan.agentLimit} agent(s) before downgrading to ${plan.name} plan.`,
                    };
                }
                else if (agents.length == plan.agentLimit) {
                    let totalSize = 0;
                    for (const agent of agents) {
                        for (const doc of agent.documents) {
                            totalSize += doc.size || 0;
                        }
                    }

                    const currentTotalSize = totalSize;
                    if (currentTotalSize > plan.totalDocSize) {
                        throw {
                            message: `Total size of all agents and their documents (${currentTotalSize / 1024}KB) exceeds the ${plan.name} plan's size limit of ${plan.totalDocSize / 1024}KB. Please upgrade to a higher plan or reduce document size.`
                        };
                    }
                }

                const prorationDate = new Date();
                await stripe.subscriptions.update(
                    subscriptions.data[0].id,
                    {
                        items: [
                            {
                                id: subscriptions.data[0].items.data[0].id,
                                price: plan.priceId,
                            },
                        ],
                        proration_behavior: 'always_invoice',
                        proration_date: prorationDate,
                    },
                );
                return { isUrl: false, message: "Plan Downgraded successfully" };
            }

            if (latestInvoice.status != "paid" || latestInvoice.status == "void") {

                //void the invoice
                if (latestInvoice.status !== "void") {
                    const voidedInvoice = await stripe.invoices.voidInvoice(latestInvoiceId);
                    console.log('Invoice voided:', voidedInvoice.id);
                }
                await stripe.subscriptions.update(
                    subscriptions.data[0].id,
                    {
                        items: [
                            {
                                id: subscriptions.data[0].items.data[0].id,
                                price: plan.priceId,
                            },
                        ],
                        proration_behavior: 'none',
                        billing_cycle_anchor: 'now'
                    },
                );


            }
            else {
                const prorationDate = new Date();
                await stripe.subscriptions.update(
                    subscriptions.data[0].id,
                    {
                        items: [
                            {
                                id: subscriptions.data[0].items.data[0].id,
                                price: plan.priceId,
                            },
                        ],
                        proration_behavior: 'always_invoice',
                        proration_date: prorationDate,
                    },
                );
            }


            const returnUrl = 'https://www.sayy.ai/admin/account/plans';

            const portalSession = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
            });
            return { isUrl: true, message: portalSession.url };
        }


    } catch (err) {
        throw await errorMessage(err.message);
    }
}

//*************************************webhooks controllers*************************************

export const handleCustomerCreate = async (customerEmail, customerDetails) => {
    try {
        const client = await ClientModel.findOne({ 'signUpVia.handle': customerEmail });
        if (!client) {
            throw {
                message: "Client not found",
            };
        }
        if (client.stripeCustomerId == "") {
            await ClientModel.findOneAndUpdate({ 'signUpVia.handle': customerEmail }, { $set: { stripeCustomerId: customerDetails.id, stripeCustomerProfile: customerDetails } });
        }
    } catch (err) {
        console.log('handleCustomerCreation error', err);
    }
}


export const handleCustomerUpdate = async (customerId, customerDetails) => {
    try {
        await ClientModel.findOneAndUpdate({ stripeCustomerId: customerId }, { $set: { stripeCustomerProfile: customerDetails } });

    } catch (err) {
        console.log('handleCustomerUpdate error', err);
    }
}

export const handleSubscriptionDeleted = async (customerId) => {
    try {
        const client = await ClientModel.findOne({ stripeCustomerId: customerId });
        if (client) {
            const resetDate = new Date();
            resetDate.setMonth(resetDate.getMonth() + 1);
            await ClientModel.findOneAndUpdate({ stripeCustomerId: customerId }, { $set: { availableCredits: 100, creditsPerMonth: 100, creditsPerMonthResetDate: resetDate, planId: "STARTER" } });
            let agents = await Agent.find({ clientId: client._id });
            if (agents.length > 0) {
                for (let agent of agents) {
                    await Agent.findOneAndDelete({ _id: agent._id });
                }
            }
        }
        await Subscription.findOneAndDelete({ customerId: customerId });
    } catch (err) {
        console.log('handleSubscriptionDeleted error', err);
    }
}

export const handleSubscriptionCreated = async (customerId, subscriptionDetails) => {
    try {

        await Subscription.create({
            customerId: customerId,
            subscriptionDetails: subscriptionDetails,
        });
    } catch (err) {
        console.log('handleSubscriptionCreated error', err);
    }
}

export const handleSubscriptionUpdated = async (customerId, subscriptionDetails) => {
    try {
        await Subscription.findOneAndUpdate({ customerId: customerId }, { $set: { subscriptionDetails: subscriptionDetails } });
    } catch (err) {
        console.log('handleSubscriptionUpdated error', err);
    }
}

export const handleInvoiceCreated = async (invoiceDetails) => {
    try {
        await Invoice.create({
            invoiceId: invoiceDetails.id,
            customerId: invoiceDetails.customer,
            subscriptionId: invoiceDetails.subscription,
            invoiceDetails: invoiceDetails,
        });
    } catch (err) {
        console.log('handleInvoiceCreated error', err);
    }
}

export const handleInvoiceUpdated = async (invoiceDetails) => {
    try {
        await Invoice.findOneAndUpdate({ invoiceId: invoiceDetails.id }, { $set: { invoiceDetails: invoiceDetails } });
    } catch (err) {
        console.log('handleInvoiceUpdated error', err);
    }
}

export const handleInvoicePaymentFailed = async (invoiceDetails) => {
    try {
        await Invoice.findOneAndUpdate({ invoiceId: invoiceDetails.id }, { $set: { invoiceDetails: invoiceDetails } });

        // TODO: set plan to starter
    } catch (err) {
        console.log('handleInvoicePaymentFailed error', err);
    }
}

export const handleInvoicePaid = async (invoiceDetails) => {
    try {
        await new Promise(resolve => setTimeout(resolve, 5000));
        let subscription = await Subscription.findOne({ 'subscriptionDetails.id': invoiceDetails.subscription });
        let priceId = subscription.subscriptionDetails.plan.id
        const plan = config.PLANS.find(plan => plan.priceId === priceId);
        const credits = plan.credits;
        const resetDate = new Date();
        if (plan.recurrence === 'monthly') {
            resetDate.setMonth(resetDate.getMonth() + 1);
        } else if (plan.recurrence === 'yearly') {
            resetDate.setFullYear(resetDate.getFullYear() + 1);
        }
        await Invoice.findOneAndUpdate({ invoiceId: invoiceDetails.id }, { $set: { invoiceDetails: invoiceDetails } });
        await ClientModel.findOneAndUpdate({ stripeCustomerId: invoiceDetails.customer }, { $set: { availableCredits: credits, creditsPerMonth: credits, creditsPerMonthResetDate: resetDate, planId: plan.name } });

        // TODO: set plan to pro
    } catch (err) {
        console.log('handleInvoicePaid error', err);
    }
}

export const createBillingSession = async (clientId) => {
    try {
        const client = await ClientModel.findOne({ _id: clientId });
        if (!client) {
            throw {
                message: "Client not found",
            };
        }
        const returnUrl = 'https://www.sayy.ai/admin/account/plans';

        if (client.stripeCustomerId == "") {
            throw { message: "No Billing history" };
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: client.stripeCustomerId,
            return_url: returnUrl,
        });
        return portalSession.url;
    } catch (err) {
        console.log('createBillingSession error', err);
    }
}

export const createStripeAccountLink = async (accountId) => {
    try {
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            return_url: `https://www.sayy.ai/admin/operations/payments`,
            refresh_url: `https://www.sayy.ai/admin/operations/payments`,
            type: "account_onboarding",
        });

        return accountLink
    } catch (err) {
        throw err
    }
}

export const createStripeAccount = async (email) => {
    try {
        const account = await stripe.accounts.create({
            email: email,
            settings: {
                payouts: {
                    manual: true, // Disables automatic payouts
                },
            },
        });

        return account.id;
    } catch (err) {
        throw err
    }
}

export const updateStripeAccount = async (accountDetails) => {
    try {
        const accountId = accountDetails.id;
        if (accountDetails.charges_enabled == true && accountDetails.payouts_enabled == true && accountDetails.details_submitted == true) {
            await ClientModel.findOneAndUpdate({ 'paymentMethods.stripe.accountId': accountId }, { $set: { 'paymentMethods.stripe.isActivated': true } });
        }
        else {
            await ClientModel.findOneAndUpdate({ 'paymentMethods.stripe.accountId': accountId }, { $set: { 'paymentMethods.stripe.isActivated': false } });
        }
        return
    } catch (err) {
        throw err
    }
}

export const getPayoutBalance = async (accountId) => {
    try {
        const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
        return { available: balance.available, pending: balance.pending };
    } catch (err) {
        throw err
    }
}

export const payOutProduct = async (accountId, amount, currency) => {
    try {
        const payout = await stripe.payouts.create({
            amount: 1000,
            currency: 'usd',
            stripeAccount: 'acct_1RNspaAwsOsGyrfz'
        });
        return payout;
    } catch (err) {
        throw err
    }
}