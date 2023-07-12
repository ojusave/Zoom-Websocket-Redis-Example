// Bring in environment secrets through dotenv
require('dotenv/config')

// Use the axios module to make HTTP requests from Node
const axios = require('axios')

// Import Redis client
const Redis = require('ioredis');
const redis = new Redis({
    host: '127.0.0.1',
    port: 6379
});

(async () => {
    try {
        const authString = Buffer.from(`${process.env.clientID}:${process.env.clientSecret}`).toString('base64');

        // Request an access token using the account id associated with your app
        let response = await axios.post('https://zoom.us/oauth/token?grant_type=account_credentials&account_id=' + process.env.account_id, {}, {
            headers: {
                Authorization: 'Basic ' + authString
            }
        });

        let bwt = response.data.access_token;

        // Logs your access tokens in the console
        console.log(`access_token: ${bwt}`);

        // We can now use the access token to authenticate API calls
        // Send a request to get your user information using the userID of the user.
        let userResponse = await axios.get(`https://api.zoom.us/v2/users/${process.env.user_id}`, {
            headers: { Authorization: `Bearer ${bwt}` }
        });
        
        console.log(`User Id is ${process.env.user_id}`);
        console.log('API call ', userResponse.data);

        // Connect to WebSocket
        const WebSocket = require('ws');
        const exampleSocket = new WebSocket(`wss://ws.zoom.us/ws?subscriptionId=${process.env.subscription_id}&access_token=${bwt}`);

        exampleSocket.on('open', () => {
            console.log("Connection...");

            // Send a heartbeat message
            const msg = {
                module: "heartbeat"
            };
            exampleSocket.send(JSON.stringify(msg));
        });

        exampleSocket.on('message', (data) => {
            console.log(JSON.parse(data));

            // Send a POST request to store the event data
            axios.post('http://localhost:4000/store-event', { eventData: typeof data === 'string' ? JSON.parse(data) : data })
                .then((response) => {
                    console.log('Event data stored:', response.data);
                })
                .catch((error) => {
                    console.error('Error:', error);
                });
        });

        exampleSocket.on('close', (event) => {
            console.log(event);
        });

        // Send heartbeat message periodically
        setInterval(() => {
            const msg = {
                module: "heartbeat"
            };
            exampleSocket.send(JSON.stringify(msg));
            console.log(JSON.stringify(msg));
        }, 25000);

    } catch (error) {
        console.error('Error:', error);
    }
})();

const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

let eventCounter = 1; // Initialize event counter

app.post('/store-event', async (req, res) => {
    try {
        // Prepare the data
        const eventData = JSON.stringify({
            //Number: eventCounter,
            Payload: req.body.eventData,
            //Time: localTime
        });

        // Increment the event counter
        eventCounter++;

        // Push event data to a list
        await redis.rpush('events', eventData);

        res.send({ status: 'success' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ status: 'error', message: 'An error occurred' });
    }
});

app.listen(4000, () => console.log(`Zoom Hello World app listening at PORT: 4000`));
