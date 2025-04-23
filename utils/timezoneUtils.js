/**
 * Timezone utility functions for appointment booking system
 */

/**
 * Convert a time from one timezone to another
 * @param {string} timeStr - Time string in format "HH:MM"
 * @param {string} dateStr - Date string in format "YYYY-MM-DD" or "DD-MMM-YYYY"
 * @param {string} sourceTimezone - Source timezone
 * @param {string} targetTimezone - Target timezone
 * @returns {string} - Converted time in "HH:MM" format
 */
 export const convertTime = (timeStr, dateStr, sourceTimezone, targetTimezone) => {
    // If timezones are the same, no conversion needed
    if (sourceTimezone === targetTimezone) {
        return timeStr;
    }

    try {
        // Parse date string based on format
        let dateParts;
        if (dateStr.includes('-')) {
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // YYYY-MM-DD format
                dateParts = dateStr.split('-');
                dateStr = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
            } else {
                // DD-MMM-YYYY format
                const months = {
                    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
                    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
                };
                dateParts = dateStr.split('-');
                const day = parseInt(dateParts[0], 10);
                const month = months[dateParts[1]];
                const year = parseInt(dateParts[2], 10);
                dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }
        }

        // Parse time string
        const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));

        // Create a date object in the source timezone
        const date = new Date(`${dateStr}T${timeStr}:00`);

        // Create a formatter for the source timezone
        const sourceFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: sourceTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Create a formatter for the target timezone
        const targetFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: targetTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        // Get offset between the source and local timezone
        const sourceParts = sourceFormatter.formatToParts(date);
        const sourceObj = {};
        sourceParts.forEach(part => {
            if (part.type !== 'literal') {
                sourceObj[part.type] = part.value;
            }
        });

        // Get date in target timezone
        const targetParts = targetFormatter.formatToParts(date);
        const targetObj = {};
        targetParts.forEach(part => {
            if (part.type !== 'literal') {
                targetObj[part.type] = part.value;
            }
        });

        // Return the time in HH:MM format
        return `${targetObj.hour}:${targetObj.minute}`;
    } catch (error) {
        console.error('Error converting timezone:', error);
        return timeStr; // Return original time if conversion fails
    }
};

/**
 * Get the difference between two timezones in hours
 * @param {string} timezone1 - First timezone
 * @param {string} timezone2 - Second timezone
 * @returns {number} - Difference in hours (can be negative)
 */
export const getTimezoneDifference = (timezone1, timezone2) => {
    const now = new Date();
    
    const options = { timeZone: timezone1, hour12: false, hour: 'numeric', minute: 'numeric' };
    const time1 = new Date(`${now.toLocaleDateString()} ${now.toLocaleTimeString('en-US', options)}`);
    
    options.timeZone = timezone2;
    const time2 = new Date(`${now.toLocaleDateString()} ${now.toLocaleTimeString('en-US', options)}`);
    
    return (time1 - time2) / (1000 * 60 * 60);
};

/**
 * Format a time string (HH:MM) to AM/PM format
 * @param {string} timeStr - Time string in format "HH:MM"
 * @returns {string} - Formatted time string (e.g., "2:30 PM")
 */
export const formatTimeToAMPM = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

/**
 * Parse date string in "DD-MMM-YYYY" format to a Date object
 * @param {string} dateStr - Date string in format "DD-MMM-YYYY"
 * @returns {Date} - JavaScript Date object
 */
export const parseDateString = (dateStr) => {
    const months = {
        'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
        'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    
    const parts = dateStr.split('-');
    const day = parseInt(parts[0], 10);
    const month = months[parts[1]];
    const year = parseInt(parts[2], 10);
    
    return new Date(year, month, day);
};

/**
 * Format a date to "DD-MMM-YYYY" format
 * @param {Date} date - JavaScript Date object
 * @returns {string} - Formatted date string
 */
export const formatDateToAPI = (date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};