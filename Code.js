/**
 * Google Apps Script Backend for Adira Telecom PO Allocator
 * Author: Antigravity AI
 * 
 * This file handles:
 * - Serving the Web App UI (Index.html)
 * - User Authentication
 * - Excel data uploads for Prices, Allocations (Matrix & Row), and AD Balances (Ledger)
 * - Real-time synchronization of distributor confirmations, sales approvals, deadlines, and announcements.
 * - Warehouse Dispatch details (transporter details, LR numbers).
 */

// Spreadsheets sheets configuration
const SHEETS = {
  USERS: 'Users',
  PRICES: 'Prices',
  ALLOCATIONS: 'Allocations',
  SETTINGS: 'Settings',
  DISTRIBUTORS: 'Distributors',
  LOGS: 'Logs',
  ANNOUNCEMENTS: 'Announcements'
};

/**
 * Serves the HTML web application
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Adira Telecom PO Allocator & Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Utility: Gets sheet by name or creates it if missing
 */
function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * Authenticates a user against the Users sheet
 */
function authenticateUser(username, password) {
  try {
    const sheet = getOrCreateSheet(SHEETS.USERS);
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      if (data.length === 0 || data[0].length === 0) {
        sheet.appendRow(['Username', 'Password', 'Role', 'FullName', 'Area']);
      }
      sheet.appendRow(['admin', 'admin123', 'admin', 'Billing Admin', 'Gujarat']);
      sheet.appendRow(['sales_gujarat', 'sales123', 'sales', 'Gujarat Sales Head', 'Gujarat']);
      sheet.appendRow(['ad_ahmedabad', 'ad123', 'ad', 'Ahmedabad Realme Distributor', 'Ahmedabad']);
      sheet.appendRow(['warehouse', 'wh123', 'warehouse', 'Gujarat Warehouse Head', 'Gujarat']);
      return { success: true, user: { username: 'admin', role: 'admin', fullName: 'Billing Admin', area: 'Gujarat' } };
    }
    
    const headers = data[0];
    const userIdx = headers.indexOf('Username');
    const passIdx = headers.indexOf('Password');
    const roleIdx = headers.indexOf('Role');
    const nameIdx = headers.indexOf('FullName');
    const areaIdx = headers.indexOf('Area');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdx].toString().trim().toLowerCase() === username.trim().toLowerCase()) {
        if (data[i][passIdx].toString() === password.toString()) {
          return {
            success: true,
            user: {
              username: data[i][userIdx],
              role: data[i][roleIdx],
              fullName: data[i][nameIdx],
              area: data[i][areaIdx],
              mappedRSD: headers.indexOf('MappedRSD') !== -1 ? data[i][headers.indexOf('MappedRSD')] : ''
            }
          };
        }
      }
    }
    return { success: false, message: 'Invalid Username or Password' };
  } catch (error) {
    return { success: false, message: 'Auth Error: ' + error.toString() };
  }
}

/**
 * Fetches all necessary dashboard data based on role
 */
function getDashboardData(userRole, username) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Load Settings
    const settingsSheet = getOrCreateSheet(SHEETS.SETTINGS);
    const settingsData = settingsSheet.getDataRange().getValues();
    const settings = {
      writeUp: 'Welcome to Adira Telecom Allocation Portal. Please confirm your stock allocations before the deadline.',
      confirmationDeadline: '',
      paymentDeadline: '',
      approvalAuthority: 'both',
      allowADReopen: 'no',
      utrVerification: 'verified',
      gracePeriod: 0,
      minOrderQty: 0,
      maintenanceMode: 'off'
    };
    if (settingsData.length > 1) {
      for (let i = 1; i < settingsData.length; i++) {
        const key = settingsData[i][0];
        const val = settingsData[i][1];
        if (key === 'writeUp') settings.writeUp = val;
        if (key === 'confirmationDeadline') settings.confirmationDeadline = val;
        if (key === 'paymentDeadline') settings.paymentDeadline = val;
        if (key === 'approvalAuthority') settings.approvalAuthority = val;
        if (key === 'allowADReopen') settings.allowADReopen = val;
        if (key === 'utrVerification') settings.utrVerification = val;
        if (key === 'gracePeriod') settings.gracePeriod = val;
        if (key === 'minOrderQty') settings.minOrderQty = val;
        if (key === 'maintenanceMode') settings.maintenanceMode = val;
      }
    }
    
    // Load Price Catalog
    const priceSheet = getOrCreateSheet(SHEETS.PRICES);
    const priceRows = priceSheet.getDataRange().getValues();
    const prices = {};
    if (priceRows.length > 1) {
      for (let i = 1; i < priceRows.length; i++) {
        prices[priceRows[i][0]] = Number(priceRows[i][1]);
      }
    }
    
    // Load Distributors Ledger
    const distSheet = getOrCreateSheet(SHEETS.DISTRIBUTORS);
    const distRows = distSheet.getDataRange().getValues();
    const distributors = [];
    if (distRows.length > 1) {
      const headers = distRows[0];
      for (let i = 1; i < distRows.length; i++) {
        const row = distRows[i];
        const item = {};
        headers.forEach((header, idx) => {
          item[header] = row[idx];
        });
        distributors.push(item);
      }
    } else {
      // Initialize headers if empty
      distSheet.appendRow(['AD Name', 'Contact Number', 'Area', 'Outstanding Balance', 'Credit Limit']);
    }
    
    // Load Allocations
    const allocSheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    const allocRows = allocSheet.getDataRange().getValues();
    const allocations = [];
    
    if (allocRows.length > 1) {
      const headers = allocRows[0];
      for (let i = 1; i < allocRows.length; i++) {
        const row = allocRows[i];
        const item = {};
        headers.forEach((header, idx) => {
          item[header] = row[idx];
        });
        
        // Filter: ADs can only see their own allocations
        if (userRole === 'ad' && item['AD Name'].toLowerCase() !== username.toLowerCase()) {
          continue;
        }
        allocations.push(item);
      }
    }
    
    // Load System Action Logs
    const logSheet = getOrCreateSheet(SHEETS.LOGS);
    const logRows = logSheet.getDataRange().getValues();
    const logs = [];
    if (logRows.length > 1) {
      const logHeaders = logRows[0];
      // Load logs in reverse order (newest first)
      for (let i = logRows.length - 1; i >= 1; i--) {
        const row = logRows[i];
        const logItem = {};
        logHeaders.forEach((header, idx) => {
          logItem[header] = row[idx];
        });
        logs.push(logItem);
      }
    } else {
      // Init headers
      logSheet.appendRow(['ID', 'Timestamp', 'User', 'Action', 'Details']);
    }

    // Load RSD Announcements
    const annSheet = getOrCreateSheet(SHEETS.ANNOUNCEMENTS);
    const annRows = annSheet.getDataRange().getValues();
    const rsdAnnouncements = {};
    if (annRows.length > 1) {
      for (let i = 1; i < annRows.length; i++) {
        const row = annRows[i];
        if (row[0]) {
          rsdAnnouncements[row[0]] = {
            subject: row[1] || '',
            message: row[2] || '',
            timestamp: row[3] || ''
          };
        }
      }
    } else {
      // Init headers
      annSheet.appendRow(['RSD Username', 'Subject', 'Message', 'Timestamp']);
    }

    return {
      success: true,
      settings: settings,
      prices: prices,
      allocations: allocations,
      distributors: distributors,
      rsdAnnouncements: rsdAnnouncements,
      logs: logs
    };
  } catch (error) {
    return { success: false, message: 'Fetch Error: ' + error.toString() };
  }
}

/**
 * Saves Admin configuration settings
 */
function setSystemSettings(settings) {
  try {
    const sheet = getOrCreateSheet(SHEETS.SETTINGS);
    sheet.clear();
    sheet.appendRow(['Setting Key', 'Setting Value']);
    sheet.appendRow(['writeUp', settings.writeUp]);
    sheet.appendRow(['confirmationDeadline', settings.confirmationDeadline]);
    sheet.appendRow(['paymentDeadline', settings.paymentDeadline]);
    sheet.appendRow(['approvalAuthority', settings.approvalAuthority || 'both']);
    sheet.appendRow(['allowADReopen', settings.allowADReopen || 'no']);
    sheet.appendRow(['utrVerification', settings.utrVerification || 'verified']);
    sheet.appendRow(['gracePeriod', settings.gracePeriod || 0]);
    sheet.appendRow(['minOrderQty', settings.minOrderQty || 0]);
    sheet.appendRow(['maintenanceMode', settings.maintenanceMode || 'off']);
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Settings Save Error: ' + error.toString() };
  }
}

/**
 * Updates prices catalog from Excel payload
 */
function updatePrices(priceList) {
  try {
    const sheet = getOrCreateSheet(SHEETS.PRICES);
    sheet.clear();
    sheet.appendRow(['Model Name', 'Price (DP)']);
    
    priceList.forEach(item => {
      sheet.appendRow([item.modelName, Number(item.price)]);
    });
    
    return { success: true, count: priceList.length };
  } catch (error) {
    return { success: false, message: 'Price Sync Error: ' + error.toString() };
  }
}

/**
 * Updates AD Ledger Balances from Excel payload
 */
function updateADBalances(balancesList) {
  try {
    const sheet = getOrCreateSheet(SHEETS.DISTRIBUTORS);
    const data = sheet.getDataRange().getValues();
    const headers = ['AD Name', 'Contact Number', 'Area', 'Outstanding Balance', 'Credit Limit'];
    
    // Read existing distributors to avoid deleting contact numbers
    const existing = {};
    if (data.length > 1) {
      const adNameIdx = data[0].indexOf('AD Name');
      const contactIdx = data[0].indexOf('Contact Number');
      const areaIdx = data[0].indexOf('Area');
      
      const outIdx = data[0].indexOf('Outstanding Balance');
      for (let i = 1; i < data.length; i++) {
        const name = data[i][adNameIdx].toString().trim();
        existing[name.toLowerCase()] = {
          contact: data[i][contactIdx] || '',
          area: data[i][areaIdx] || 'Gujarat',
          outstanding: Number(data[i][outIdx]) || 0
        };
      }
    }
    
    sheet.clear();
    sheet.appendRow(headers);
    
    balancesList.forEach(item => {
      const key = item.adName.toLowerCase();
      const contact = existing[key] ? existing[key].contact : '';
      const area = existing[key] ? existing[key].area : 'Gujarat';
      const existingOut = existing[key] ? (Number(existing[key].outstanding) || 0) : 0;
      const finalOut = existingOut + Number(item.outstandingBalance);
      
      sheet.appendRow([
        item.adName,
        contact,
        area,
        finalOut,
        Number(item.creditLimit || 300000)
      ]);
    });
    
    return { success: true, count: balancesList.length };
  } catch (error) {
    return { success: false, message: 'Balances Sync Error: ' + error.toString() };
  }
}

/**
 * Updates stock allocations from Excel payload
 */
function saveAllocationsRaw(rawList) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    sheet.clear();
    const headers = [
      'ID', 'AD Name', 'Contact Number', 'Area', 'Model Name', 
      'Allocated Qty', 'Price', 'Allocated Value', 'Confirmed Qty', 
      'PO Amount', 'Status', 'Last Updated', 'Sales Approval', 
      'UTR Number', 'Payment Verified', 'Transporter', 'LR Number', 'Dispatch Date'
    ];
    sheet.appendRow(headers);
    
    rawList.forEach(item => {
      sheet.appendRow([
        item.ID || '',
        item['AD Name'] || '',
        item['Contact Number'] || '',
        item.Area || '',
        item['Model Name'] || '',
        Number(item['Allocated Qty']) || 0,
        Number(item.Price) || 0,
        Number(item['Allocated Value']) || 0,
        item['Confirmed Qty'] !== undefined ? item['Confirmed Qty'] : '',
        item['PO Amount'] !== undefined ? item['PO Amount'] : '',
        item.Status || 'Pending',
        item['Last Updated'] || '',
        item['Sales Approval'] || '',
        item['UTR Number'] || '',
        item['Payment Verified'] || 'Pending',
        item.Transporter || '',
        item.LRNumber || '',
        item.DispatchDate || ''
      ]);
    });
    return { success: true };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

function updateAllocations(allocationsList) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    sheet.clear();
    
    const headers = [
      'ID', 'AD Name', 'Contact Number', 'Area', 'Model Name', 
      'Allocated Qty', 'Price', 'Allocated Value', 'Confirmed Qty', 
      'PO Amount', 'Status', 'Last Updated', 'Sales Approval', 
      'UTR Number', 'Payment Verified', 'Transporter', 'LR Number', 'Dispatch Date'
    ];
    sheet.appendRow(headers);
    
    // Load AD ledger sheets to automatically append new ones
    const distSheet = getOrCreateSheet(SHEETS.DISTRIBUTORS);
    const distData = distSheet.getDataRange().getValues();
    const existingADs = new Set();
    if (distData.length > 1) {
      for (let i = 1; i < distData.length; i++) {
        existingADs.add(distData[i][0].toString().trim().toLowerCase());
      }
    }
    
    allocationsList.forEach((item, index) => {
      const id = 'AL' + (1000 + index);
      const allocatedValue = Number(item.allocatedQty) * Number(item.price);
      
      // Auto-append AD to ledger if missing
      const adKey = item.adName.trim().toLowerCase();
      if (!existingADs.has(adKey) && item.adName) {
        distSheet.appendRow([item.adName, item.contactNumber || '', item.area || 'Gujarat', 0, 300000]);
        existingADs.add(adKey);
      }
      
      sheet.appendRow([
        id,
        item.adName,
        item.contactNumber || '',
        item.area || 'Gujarat',
        item.modelName,
        Number(item.allocatedQty),
        Number(item.price),
        allocatedValue,
        '', // Confirmed Qty (default empty before AD confirmation)
        '', // PO Amount (default empty before AD confirmation)
        'Pending',                 
        new Date().toISOString(),
        '', // Sales Approval (default empty before AD confirmation)                
        '',                        
        'Pending',
        '', // Transporter
        '', // LR Number
        ''  // Dispatch Date
      ]);
    });
    
    return { success: true, count: allocationsList.length };
  } catch (error) {
    return { success: false, message: 'Allocation Sync Error: ' + error.toString() };
  }
}

/**
 * AD confirms their quantities and PO
 */
function submitADConfirmation(username, confirmations, paymentInfo) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const adNameIdx = headers.indexOf('AD Name');
    const modelIdx = headers.indexOf('Model Name');
    const confQtyIdx = headers.indexOf('Confirmed Qty');
    const poAmtIdx = headers.indexOf('PO Amount');
    const statusIdx = headers.indexOf('Status');
    const timeIdx = headers.indexOf('Last Updated');
    const approvalIdx = headers.indexOf('Sales Approval');
    const utrIdx = headers.indexOf('UTR Number');
    
    let updatedCount = 0;
    
    confirmations.forEach(conf => {
      for (let i = 1; i < data.length; i++) {
        if (data[i][adNameIdx].toString().trim().toLowerCase() === username.trim().toLowerCase() && 
            data[i][modelIdx].toString().trim().toLowerCase() === conf.modelName.trim().toLowerCase()) {
          
          const allocatedQty = Number(data[i][headers.indexOf('Allocated Qty')]);
          const price = Number(data[i][headers.indexOf('Price')]);
          const newQty = Number(conf.confirmedQty);
          const newPOVal = newQty * price;
          
          const salesApprovalNeeded = (newQty !== allocatedQty) ? 'Pending Approval' : 'Approved';
          
          sheet.getRange(i + 1, confQtyIdx + 1).setValue(newQty);
          sheet.getRange(i + 1, poAmtIdx + 1).setValue(newPOVal);
          sheet.getRange(i + 1, statusIdx + 1).setValue(paymentInfo ? 'Paid' : 'Confirmed');
          sheet.getRange(i + 1, timeIdx + 1).setValue(new Date().toISOString());
          sheet.getRange(i + 1, approvalIdx + 1).setValue(salesApprovalNeeded);
          
          if (paymentInfo) {
            sheet.getRange(i + 1, utrIdx + 1).setValue(paymentInfo.utrNumber || '');
          }
          
          updatedCount++;
        }
      }
    });
    
    return { success: true, count: updatedCount };
  } catch (error) {
    return { success: false, message: 'AD Confirm Error: ' + error.toString() };
  }
}

/**
 * Sales head approves or rejects a distributor's quantity adjustment
 */
function approveAdjustment(id, approved) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf('ID');
    const approvalIdx = headers.indexOf('Sales Approval');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx].toString() === id.toString()) {
        sheet.getRange(i + 1, approvalIdx + 1).setValue(approved ? 'Approved' : 'Rejected');
        return { success: true };
      }
    }
    return { success: false, message: 'Allocation ID not found' };
  } catch (error) {
    return { success: false, message: 'Approval Error: ' + error.toString() };
  }
}

/**
 * Verify payment status (Admin action)
 */
function verifyPayment(id, verified) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf('ID');
    const payVerifiedIdx = headers.indexOf('Payment Verified');
    const statusIdx = headers.indexOf('Status');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx].toString() === id.toString()) {
        sheet.getRange(i + 1, payVerifiedIdx + 1).setValue(verified ? 'Verified' : 'Rejected');
        if (verified) {
          sheet.getRange(i + 1, statusIdx + 1).setValue('Completed');
        }
        return { success: true };
      }
    }
    return { success: false, message: 'Allocation ID not found' };
  } catch (error) {
    return { success: false, message: 'Payment Verification Error: ' + error.toString() };
  }
}

/**
 * Mark order as dispatched from warehouse (Warehouse action)
 */
function dispatchOrder(id, transporter, lrNumber) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idIdx = headers.indexOf('ID');
    const statusIdx = headers.indexOf('Status');
    const transIdx = headers.indexOf('Transporter');
    const lrIdx = headers.indexOf('LR Number');
    const dateIdx = headers.indexOf('Dispatch Date');
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx].toString() === id.toString()) {
        sheet.getRange(i + 1, statusIdx + 1).setValue('Dispatched');
        sheet.getRange(i + 1, transIdx + 1).setValue(transporter);
        sheet.getRange(i + 1, lrIdx + 1).setValue(lrNumber);
        sheet.getRange(i + 1, dateIdx + 1).setValue(new Date().toISOString());
        return { success: true };
      }
    }
    return { success: false, message: 'Allocation ID not found' };
  } catch (error) {
    return { success: false, message: 'Dispatch Error: ' + error.toString() };
  }
}

/**
 * Setup Utility: Run this function once in the Apps Script editor to initialize the spreadsheet sheets and headers automatically!
 */
function writeLogEntry(log) {
  try {
    const sheet = getOrCreateSheet(SHEETS.LOGS);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['ID', 'Timestamp', 'User', 'Action', 'Details']);
    }
    sheet.appendRow([log.ID || '', log.Timestamp || '', log.User || '', log.Action || '', log.Details || '']);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function clearLogsSheet() {
  try {
    const sheet = getOrCreateSheet(SHEETS.LOGS);
    sheet.clear();
    sheet.appendRow(['ID', 'Timestamp', 'User', 'Action', 'Details']);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function initializeSpreadsheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Users sheet
    let sheet = getOrCreateSheet(SHEETS.USERS);
    sheet.clear();
    sheet.appendRow(['Username', 'Password', 'Role', 'FullName', 'Area']);
    sheet.appendRow(['admin', 'admin123', 'admin', 'Billing Admin', 'Gujarat']);
    sheet.appendRow(['sales_gujarat', 'sales123', 'sales', 'Gujarat Sales Head', 'Gujarat']);
    sheet.appendRow(['ad_ahmedabad', 'ad123', 'ad', 'Ahmedabad Realme Distributor', 'Ahmedabad']);
    sheet.appendRow(['warehouse', 'wh123', 'warehouse', 'Gujarat Warehouse Head', 'Gujarat']);
    
    // 2. Prices sheet
    sheet = getOrCreateSheet(SHEETS.PRICES);
    sheet.clear();
    sheet.appendRow(['Model Name', 'Price (DP)']);
    sheet.appendRow(['realme C85 5G 128GB 4GB Peacock Green', 10500]);
    sheet.appendRow(['realme GT 6 12GB/256GB', 35000]);
    sheet.appendRow(['realme 13 Pro+ 5G', 28000]);
    sheet.appendRow(['realme Narzo 70 Turbo', 16000]);
    sheet.appendRow(['realme C65 5G', 10500]);

    // 3. Allocations sheet
    sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    sheet.clear();
    sheet.appendRow([
      'ID', 'AD Name', 'Contact Number', 'Area', 'Model Name', 
      'Allocated Qty', 'Price', 'Allocated Value', 'Confirmed Qty', 
      'PO Amount', 'Status', 'Last Updated', 'Sales Approval', 
      'UTR Number', 'Payment Verified', 'Transporter', 'LR Number', 'Dispatch Date'
    ]);
    
    // 4. Settings sheet
    sheet = getOrCreateSheet(SHEETS.SETTINGS);
    sheet.clear();
    sheet.appendRow(['Setting Key', 'Setting Value']);
    sheet.appendRow(['writeUp', 'Welcome to Adira Telecom Allocation Portal. Note: Confirmed allocations are strictly locked and credit will only be extended post proof verification.']);
    sheet.appendRow(['confirmationDeadline', '']);
    sheet.appendRow(['paymentDeadline', '']);
    
    // 5. Distributors ledger sheet
    sheet = getOrCreateSheet(SHEETS.DISTRIBUTORS);
    sheet.clear();
    sheet.appendRow(['AD Name', 'Contact Number', 'Area', 'Outstanding Balance', 'Credit Limit']);
    sheet.appendRow(['AD Ahmedabad', '919998887776', 'Ahmedabad', 150000, 300000]);
    sheet.appendRow(['AD Surat', '919998887777', 'Surat', 250000, 500000]);

    // 6. Logs sheet
    sheet = getOrCreateSheet(SHEETS.LOGS);
    sheet.clear();
    sheet.appendRow(['ID', 'Timestamp', 'User', 'Action', 'Details']);

    return "Spreadsheet Initialized Successfully! You can now deploy the Web App.";
  } catch (e) {
    return "Error during initialization: " + e.toString();
  }
}


/**
 * Saves or updates an announcement broadcast by an RSD
 */
function saveRSDAnnouncement(rsdUsername, subject, message) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ANNOUNCEMENTS);
    const data = sheet.getDataRange().getValues();
    const timestamp = new Date().toISOString();
    
    let foundRow = -1;
    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString().trim().toLowerCase() === rsdUsername.trim().toLowerCase()) {
          foundRow = i + 1; // 1-indexed row number
          break;
        }
      }
    }
    
    if (foundRow !== -1) {
      sheet.getRange(foundRow, 2).setValue(subject);
      sheet.getRange(foundRow, 3).setValue(message);
      sheet.getRange(foundRow, 4).setValue(timestamp);
    } else {
      sheet.appendRow([rsdUsername, subject, message, timestamp]);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}


/**
 * Updates specific allocations by ID without clearing the sheet
 * Used by non-admin roles to prevent wiping out other ADs' data
 */
function updateAllocationsPartial(partialList) {
  try {
    const sheet = getOrCreateSheet(SHEETS.ALLOCATIONS);
    const range = sheet.getDataRange();
    const data = range.getValues();
    const headers = data[0];
    const idIdx = headers.indexOf('ID');
    
    if (idIdx === -1) {
      return { success: false, message: 'ID column not found in Allocations sheet.' };
    }
    
    // Create map of updated items by ID
    const updateMap = {};
    partialList.forEach(item => {
      if (item.ID) {
        updateMap[item.ID.toString().trim()] = item;
      }
    });
    
    // Iterate through existing rows and update cells if ID matches
    for (let i = 1; i < data.length; i++) {
      const rowId = data[i][idIdx].toString().trim();
      if (updateMap[rowId]) {
        const item = updateMap[rowId];
        
        headers.forEach((header, colIdx) => {
          if (header === 'ID') return;
          
          let val = '';
          if (header === 'AD Name') val = item['AD Name'] || '';
          else if (header === 'Contact Number') val = item['Contact Number'] || '';
          else if (header === 'Area') val = item.Area || '';
          else if (header === 'Model Name') val = item['Model Name'] || '';
          else if (header === 'Allocated Qty') val = Number(item['Allocated Qty']) || 0;
          else if (header === 'Price') val = Number(item.Price) || 0;
          else if (header === 'Allocated Value') val = Number(item['Allocated Value']) || 0;
          else if (header === 'Confirmed Qty') val = item['Confirmed Qty'] !== undefined ? item['Confirmed Qty'] : '';
          else if (header === 'PO Amount') val = item['PO Amount'] !== undefined ? item['PO Amount'] : '';
          else if (header === 'Status') val = item.Status || 'Pending';
          else if (header === 'Last Updated') val = item['Last Updated'] || '';
          else if (header === 'Sales Approval') val = item['Sales Approval'] || '';
          else if (header === 'UTR Number') val = item['UTR Number'] || '';
          else if (header === 'Payment Verified') val = item['Payment Verified'] || 'Pending';
          else if (header === 'Transporter') val = item.Transporter || '';
          else if (header === 'LR Number') val = item.LRNumber || '';
          else if (header === 'Dispatch Date') val = item.DispatchDate || '';
          
          sheet.getRange(i + 1, colIdx + 1).setValue(val);
        });
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, message: 'Partial Update Error: ' + error.toString() };
  }
}
