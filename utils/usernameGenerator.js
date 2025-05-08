import { uniqueNamesGenerator, starWars, animals } from 'unique-names-generator';
import Agent from '../models/AgentModel.js';
export async function generateRandomUsername() {
    let username = uniqueNamesGenerator({
        dictionaries: [starWars, animals],
        separator: '',
        length: 2,
        style: 'lowerCase'
    }) + Math.floor(Math.random() * 1000);

    while (!await checkUsernameAvailability(username)) {
        username = uniqueNamesGenerator({
            dictionaries: [starWars, animals],
            separator: '',
            length: 2,
            style: 'lowerCase'
        }) + Math.floor(Math.random() * 1000);
    }

    return username;
}

export async function checkUsernameAvailability(username) {
    const agent = await Agent.findOne({ username });
    return !agent;
}

// Example usage:
// const username = generateRandomUsername();
// console.log(username); // Outputs something like: "speedingcapsule123" 