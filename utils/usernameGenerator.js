import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

export function generateRandomUsername() {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: '',
        length: 2,
        style: 'lowerCase'
    }) + Math.floor(Math.random() * 1000);
}

// Example usage:
// const username = generateRandomUsername();
// console.log(username); // Outputs something like: "speedingcapsule123" 