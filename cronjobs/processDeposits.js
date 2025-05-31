'use strict'
const dotenv = require('dotenv')
dotenv.config()
const config = require('../config.js')
const mongoose = require('mongoose')
const TransactionModel = require('../models/Transactions')
const OrderModel = require('../models/Orders')
const UserModel = require('../models/Users')
const { Web3 } = require('web3')
const web3 = new Web3(new Web3.providers.HttpProvider(config.nodeRPC));
const BigNumber = require('bignumber.js')
const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

mongoose
    .connect(config.MONGODB_URL, {
        user: config.MONGODB_USER,
        pass: config.MONGODB_PASS,
    }).then(console.log("connnted"))
    .catch((err) => console.log(err));


async function crawl() {
    try {
        let transactions = await TransactionModel.find({ status: 'PENDING', chain: 'BSC_BASE' })

        for (let d of transactions) {
            let now = new Date().getTime()
            let txReceipt = await web3.eth.getTransaction(d.txHash);
            let blockData = await web3.eth.getBlock(txReceipt.blockNumber);

            if (!txReceipt) {
                await TransactionModel.findOneAndUpdate({ txHash: d.txHash }, { $set: { status: 'FAILED' } })
                await OrderModel.findOneAndUpdate({ paymentId: d.txHash }, { $set: { paymentStatus: 'failed' } })
                continue
            }

            let txDate = new Date(Number(blockData.timestamp) * 1000).getTime()
            let timeDiff = now - txDate

            let receipt = await web3.eth.getTransactionReceipt(d.txHash);

            if (receipt.status && timeDiff > 10000) {
                if (!d.userAddress) {
                    let isLegit = await getTxdetails(d)
                    if (!isLegit) {
                        continue
                    }
                }
                else {
                    await TransactionModel.findOneAndUpdate({ txHash: d.txHash }, { $set: { status: 'COMPLETED' } })
                    let updatedOrder = await OrderModel.findOneAndUpdate({ paymentId: d.txHash }, { $set: { paymentStatus: 'succeeded' } }, { new: true })

                    // Convert order amount to number with 2 decimal points
                    const orderAmount = Number(updatedOrder.totalAmount.toFixed(2))

                    // Update user with multiple fields: increment gobblBalance, totalOrdersValue, and totalOrders
                    await UserModel.findOneAndUpdate(
                        { _id: updatedOrder.user },
                        {
                            $inc: {
                                gobblBalance: orderAmount * 100,
                                totalOrdersValue: orderAmount,
                                totalOrders: 1
                            }
                        }
                    )
                }
            }
            else if (receipt.status && timeDiff <= 10000) {
                if (!d.userAddress) {
                    let isLegit = await getTxdetails(d)
                    if (!isLegit) {
                        continue
                    }
                }
                else {
                    continue
                }
            }
            else {
                await TransactionModel.findOneAndUpdate({ txHash: d.txHash }, { $set: { status: 'FAILED' } })
                await OrderModel.findOneAndUpdate({ paymentId: d.txHash }, { $set: { paymentStatus: 'failed' } })
            }
        }
    }
    catch (err) {
        console.log("crawl")
        console.log(err)
    }
}

async function getTxdetails(d) {
    try {
        let txReceipt = await web3.eth.getTransaction(d.txHash);

        const typesArray = [
            { type: 'address', name: 'to' },
            { type: 'uint256', name: 'amount' }
        ];

        const logData = txReceipt.input

        const func = logData.slice(0, 10)

        if (func != '0xa9059cbb') {
            await TransactionModel.findOneAndUpdate({ txHash: d.txHash }, { $set: { status: 'FAILED' } })
            await OrderModel.findOneAndUpdate({ paymentId: d.txHash }, { $set: { paymentStatus: 'failed' } })
            return false
        }

        const decodedParameters = web3.eth.abi.decodeParameters(typesArray, logData.slice(10));

        let toAddress = decodedParameters.to.toLowerCase()
        let fromAddress = txReceipt.from.toLowerCase()
        let amount = new BigNumber(decodedParameters.amount)
            .dividedBy(new BigNumber(10).pow(18))
            .toFixed(2)
        let currency = 'USDT'
        let txHash = d.txHash

        await TransactionModel.findOneAndUpdate({ txHash: txHash }, { $set: { toAddress: toAddress, status: 'COMPLETED', fromAddress: fromAddress, amount: amount, currency: currency } })
        await OrderModel.findOneAndUpdate({ paymentId: txHash }, { $set: { paymentStatus: 'succeeded' } })
        return true

    }
    catch (err) {
        console.log("getTxdetails")
        console.log(err)
    }
}

async function main() {
    while (true) {
        await crawl()
        await waitFor(4000)
    }
}
main()