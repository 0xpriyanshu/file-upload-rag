/**
 * Timezone utility functions for appointment booking system
 * Fixed implementation using Luxon for reliability
 */

 import { DateTime } from 'luxon';

 /**
  * Validate if a timezone is valid
  * @param {string} timezone - Timezone to validate
  * @returns {boolean} - True if valid
  */
 export const isValidTimezone = (timezone) => {
     if (!timezone) return false;
     try {
         // Use Luxon to validate timezone
         const dt = DateTime.now().setZone(timezone);
         return dt.isValid;
     } catch {
         return false;
     }
 };
 
 /**
  * Get user's detected timezone with fallback
  * @returns {string} - Valid timezone string
  */
 export const getUserTimezone = () => {
     try {
         const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
         return isValidTimezone(detected) ? detected : 'UTC';
     } catch (error) {
         console.warn('Could not detect user timezone:', error);
         return 'UTC';
     }
 };
 
 /**
  * Convert a time from one timezone to another - SINGLE SOURCE OF TRUTH
  * @param {string} timeStr - Time string in format "HH:MM"
  * @param {string} dateStr - Date string in format "YYYY-MM-DD" or "DD-MMM-YYYY"
  * @param {string} sourceTimezone - Source timezone
  * @param {string} targetTimezone - Target timezone
  * @returns {string} - Converted time in "HH:MM" format
  */
 export const convertTime = (timeStr, dateStr, sourceTimezone, targetTimezone) => {
     try {
         // If timezones are the same, no conversion needed
         if (sourceTimezone === targetTimezone) {
             return timeStr;
         }
 
         // Validate inputs
         if (!timeStr || !dateStr || !sourceTimezone || !targetTimezone) {
             throw new Error('Missing required parameters for timezone conversion');
         }
 
         if (!isValidTimezone(sourceTimezone) || !isValidTimezone(targetTimezone)) {
             throw new Error(`Invalid timezone: ${sourceTimezone} or ${targetTimezone}`);
         }
 
         // Convert date to ISO format if needed
         let isoDate = dateStr;
         if (dateStr.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
             // Convert DD-MMM-YYYY to YYYY-MM-DD
             isoDate = convertAPIDateToISO(dateStr);
         }
 
         // Create DateTime object in source timezone
         const sourceDateTime = DateTime.fromISO(`${isoDate}T${timeStr}:00`, {
             zone: sourceTimezone
         });
 
         if (!sourceDateTime.isValid) {
             throw new Error(`Invalid date/time: ${dateStr} ${timeStr} in ${sourceTimezone}`);
         }
 
         // Convert to target timezone and return formatted time
         const targetDateTime = sourceDateTime.setZone(targetTimezone);
         return targetDateTime.toFormat('HH:mm');
 
     } catch (error) {
         console.error('Timezone conversion error:', error);
         console.error('Inputs:', { timeStr, dateStr, sourceTimezone, targetTimezone });
         
         // Fallback: return original time with warning
         console.warn('Using fallback: returning original time');
         return timeStr;
     }
 };
 
 /**
  * Convert time to UTC - commonly used function
  * @param {string} timeStr - Time string in format "HH:MM"
  * @param {string} dateStr - Date string
  * @param {string} timezone - Source timezone
  * @returns {string} - Time in UTC
  */
 export const toUTC = (timeStr, dateStr, timezone) => {
     return convertTime(timeStr, dateStr, timezone, 'UTC');
 };
 
 /**
  * Convert time from UTC to specific timezone
  * @param {string} timeStr - Time string in UTC
  * @param {string} dateStr - Date string
  * @param {string} timezone - Target timezone
  * @returns {string} - Time in target timezone
  */
 export const fromUTC = (timeStr, dateStr, timezone) => {
     return convertTime(timeStr, dateStr, 'UTC', timezone);
 };
 
 /**
  * Get the difference between two timezones in hours (improved version)
  * @param {string} timezone1 - First timezone
  * @param {string} timezone2 - Second timezone
  * @param {Date} date - Date to check difference for (defaults to now)
  * @returns {number} - Difference in hours
  */
 export const getTimezoneDifference = (timezone1, timezone2, date = new Date()) => {
     try {
         const dt1 = DateTime.fromJSDate(date, { zone: timezone1 });
         const dt2 = DateTime.fromJSDate(date, { zone: timezone2 });
         
         return (dt1.offset - dt2.offset) / 60; // Convert minutes to hours
     } catch (error) {
         console.error('Error calculating timezone difference:', error);
         return 0;
     }
 };
 
 /**
  * Format timezone for display
  * @param {string} timezone - Timezone to format
  * @returns {string} - Formatted timezone name
  */
 export const formatTimezone = (timezone) => {
     try {
         const date = new Date();
         const formatter = new Intl.DateTimeFormat('en-US', {
             timeZone: timezone,
             timeZoneName: 'short'
         });
         
         const parts = formatter.formatToParts(date);
         const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;
         
         return timeZoneName || timezone;
     } catch (error) {
         console.error('Error formatting timezone:', error);
         return timezone;
     }
 };
 
 /**
  * Check if a time is in the past considering timezone
  * @param {string} dateStr - Date string
  * @param {string} timeStr - Time string
  * @param {string} timezone - Timezone to check in
  * @returns {boolean} - True if time is in the past
  */
 export const isInPast = (dateStr, timeStr, timezone) => {
     try {
         let isoDate = dateStr;
         if (dateStr.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
             isoDate = convertAPIDateToISO(dateStr);
         }
 
         const slotDateTime = DateTime.fromISO(`${isoDate}T${timeStr}:00`, {
             zone: timezone
         });
         
         if (!slotDateTime.isValid) return true;
 
         const now = DateTime.now().setZone(timezone);
         return slotDateTime <= now;
     } catch (error) {
         console.error('Error checking if time is in past:', error);
         return true; // Assume past if error
     }
 };
 
 /**
  * Format a time string (HH:MM) to AM/PM format
  * @param {string} timeStr - Time string in format "HH:MM"
  * @returns {string} - Formatted time string (e.g., "2:30 PM")
  */
 export const formatTimeToAMPM = (timeStr) => {
     try {
         const [hours, minutes] = timeStr.split(':').map(Number);
         const period = hours >= 12 ? 'PM' : 'AM';
         const hour12 = hours % 12 || 12;
         return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
     } catch (error) {
         console.error('Error formatting time to AM/PM:', error);
         return timeStr;
     }
 };
 
 /**
  * Parse date string in "DD-MMM-YYYY" format to a Date object
  * @param {string} dateStr - Date string in format "DD-MMM-YYYY"
  * @returns {Date} - JavaScript Date object
  */
 export const parseDateString = (dateStr) => {
     try {
         const months = {
             'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
             'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
         };
         
         const parts = dateStr.split('-');
         const day = parseInt(parts[0], 10);
         const month = months[parts[1]];
         const year = parseInt(parts[2], 10);
         
         return new Date(year, month, day);
     } catch (error) {
         console.error('Error parsing date string:', error);
         return new Date(); // Return current date as fallback
     }
 };
 
 /**
  * Format a date to "DD-MMM-YYYY" format
  * @param {Date} date - JavaScript Date object
  * @returns {string} - Formatted date string
  */
 export const formatDateToAPI = (date) => {
     try {
         const day = date.getDate().toString().padStart(2, '0');
         const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
         const month = monthNames[date.getMonth()];
         const year = date.getFullYear();
         return `${day}-${month}-${year}`;
     } catch (error) {
         console.error('Error formatting date to API format:', error);
         return '';
     }
 };
 
 /**
  * Helper function to convert DD-MMM-YYYY to YYYY-MM-DD
  * @param {string} apiDate - Date in DD-MMM-YYYY format
  * @returns {string} - Date in YYYY-MM-DD format
  */
 const convertAPIDateToISO = (apiDate) => {
     const months = {
         'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
         'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
     };
     
     const [day, month, year] = apiDate.split('-');
     return `${year}-${months[month]}-${day}`;
 };
 
 // Backward compatibility - these functions replace your old complex ones
 export const convertTimeUniversal = convertTime;
 export const convertTimeRobust = convertTime;
 export const convertTimeBetweenZones = convertTime;
 