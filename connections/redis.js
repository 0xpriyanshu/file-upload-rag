import redis from 'redis';
import config from '../config.js';

// Create a Redis client
const client = redis.createClient({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    // password: config.redis.password, // Uncomment if needed
});

client.on('connect', () => {
    console.log('Connected to Redis');
});

client.on('error', (err) => {
    console.error('Redis error: ', err);
});

// Function to close the Redis connection
const closeRedisClient = () => {
    client.quit((err) => {
        if (err) {
            console.error('Error closing Redis connection: ', err);
        } else {
            console.log('Redis connection closed');
        }
    });
};

// Export the Redis client and close function
export {
    client,
    closeRedisClient,
};
