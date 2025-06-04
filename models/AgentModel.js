import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema({
    clientId: {
        type: String,
        required: true,
    },
    agentId: {
        type: String,
        required: true,
    },
    documentCollectionId: {
        type: String,
        required: true,
    },
    documents: [{
        documentId: {
            type: String,
            required: true
        },
        title: {
            type: String,
            default: 'Untitled Document'
        },
        size: {
            type: Number,
            default: 0
        },
        addedAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }],
    model: {
        type: String,
        required: true,
        default: "gpt-4o-mini",
        enum: ['gpt-4o-mini', 'GPT-4o Mini', 'Llama 4 Maverick', 'llama-4-maverick', 'GPT-3.5 Turbo', 'Llama 3 Pro', 'Gemini Ultra', 'Claude 3 Opus', 'Mistral Large', 'Mixtral 8x22B', 'Grok-1']
    },
    systemPrompt: {
        type: String,
        required: true,
        default: "You are a concise AI assistant. Use the provided context to answer the user's question when relevant. If the context doesn't contain the answer or if the query is conversational, respond appropriately.\nRules:\n- Answer in 1-2 plain sentences only.\n- Do not add extra explanation, greetings, or conclusions.\n- No special characters, markdown, or formatting."
    },
    name: {
        type: String,
        required: true,
        default: "Agent"
    },
    bio: {
        type: String,
        required: false,
        default: ""
    },
    username: {
        type: String,
        required: false,
        default: ""
    },
    metadata: {
        type: Object,
        required: true,
        default: {}
    },
    personalityType: {
        type: Object,
        default: {
            name: "FRIEND",
            value: ["Warm", "Relatable", "Conversational"],
        },
    },
    isCustomPersonality: {
        type: Boolean,
        default: false
    },
    customPersonalityPrompt: {
        type: String,
        required: false,
        default: ""
    },
    logo: {
        type: String,
        required: false,
        default: ""
    },
    personalityAnalysis: {
        type: {
            dominantTrait: String,
            confidence: Number,
            briefDescription: String,
            speechPatterns: [String],
            vocabularyStyle: String,
            sentenceStructure: String,
            emotionalTone: String,
            uniqueMannerisms: String,
            mimicryInstructions: String
        },
        required: false,
        default: null
    },
    calendlyUrl: {
        type: String,
        required: false,
        default: ""
    },
    lastPersonalityUrl: {
        type: String,
        required: false,
        default: ""
    },
    lastPersonalityContent: {
        type: String,
        required: false,
        default: ""
    },
    themeColors: {
        type: Object,
        required: false,
        default: {
            "id": "sky-blue",
            "name": "SkyBlue",
            "isDark": false,
            "mainDarkColor": "#ABC3FF",
            "mainLightColor": "#4A68EC",
            "highlightColor": "#001C9A"
        }
    },
    promotionalBanner: {
        type: String,
        required: false,
        default: ""
    },
    isPromoBannerEnabled: {
        type: Boolean,
        required: false,
        default: false
    },
    personalityType: {
        type: Object,
        required: false
    },
    customVoiceExamples: {
        type: String,
        required: false,
        default: ""
    },
    welcomeMessage: {
        type: String,
        required: false,
        default: "Hi there! How can I help you?"
    },
    prompts: {
        type: [String],
        required: false,
        default: []
    },
    generatedPrompts: {
        type: [String],
        required: false,
        default: []
    },
    language: {
        type: String,
        required: false,
        default: "English"
    },
    smartenUpAnswers: {
        type: [String],
        required: false,
        default: ["", "", "", ""]
    },
    policies: {
        type: Object,
        default: {
            shipping: { enabled: false, content: "" },
            returns: { enabled: false, content: "" },
            privacy: { enabled: false, content: "" },
            terms: { enabled: false, content: "" },
            custom: {}
        }
    },
    customerLeadFlag: {
        type: Boolean,
        default: false
    },
    customerLeads: {
        type: [Object],
        default: []
    },
    isQueryable: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    whatsappNumber: {
        type: Object,
        required: false,
        default: {
            countryCode: "",
            number: "",
        }
    }
});

const Agent = mongoose.model("Agent", AgentSchema, "Agent");

export default Agent;
