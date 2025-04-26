// models/FormConfig.js
import mongoose from 'mongoose';

const inputFieldSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['text', 'number', 'email', 'password', 'date', 'select', 'radio', 'checkbox', 'textarea', 'file']
    },
    label: {
        type: String,
        required: true
    },
    placeholder: {
        type: String,
        default: ''
    },
    required: {
        type: Boolean,
        default: false
    },
    defaultValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    options: [{
        label: String,
        value: mongoose.Schema.Types.Mixed
    }], 
    validation: {
        pattern: String,
        minLength: Number,
        maxLength: Number,
        min: Number,
        max: Number,
        customErrorMessage: String
    },
    order: {
        type: Number,
        default: 0
    }
});

const formConfigSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
        unique: true 
    },
    formName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    inputs: [inputFieldSchema],
    submitButtonText: {
        type: String,
        default: 'Submit'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'draft'],
        default: 'active'
    },
    createdBy: {
        type: String, 
        required: true
    },
    lastModifiedBy: {
        type: String
    }
}, {
    timestamps: true
});

const FormConfig = mongoose.model('FormConfig', formConfigSchema);
export default FormConfig;