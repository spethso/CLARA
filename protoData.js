
/**
 * Module to get data out of proto file for an API Adapter
 * @author spethso
 */
// Load proto file and grpc module
var PROTO_PATH = __dirname + '/webshop.proto';
var grpc = require('grpc');
var parent = grpc.load(PROTO_PATH);
// Name of proto package
var package = initPackage(parent);
package = package.slice(0, package.length - 1); // Delete last '.'
// Object of proto messages and services
var proto = initProto(parent)
// Useful additional modules
var fs = require('fs');
var HashMap = require('hashmap');
var HashSet = require('hashset');

// Array of services
var services = initServices();
// Array with all services rpc operation data
var serviceAndOperations = [];
// HashMap containing all message types as JSON
var messageTypes = new HashMap();
// HashSet for JSON type Number
var numberTypes = getNumberTypes();
// HashSet for JSON type String
var stringTypes = getStringTypes();

/**
 * Export relevant data
 */
exports.getData = function () {
    getMessagesData();
    getOperationsData();
    var data = {
        package: package,
        services: serviceAndOperations,
        messages: messageTypes
    };
    return data;
}

/**
 * Initialize service Array
 */
function initServices() {
    var services = [];
    for (var key in proto) {
        if (proto[key].hasOwnProperty('service')) {
            services.push(proto[key].service);
        }
    }
    return services;
}


/**
 * Initialize package variable
 */
function initPackage(obj) {
    var keys = Object.keys(obj);
    var localPackage = keys[0];
    if (keys.length == 1) {
        return localPackage + '.' + initPackage(obj[keys[0]]);
    } else {
        return '';
    }
}

/**
 * Initialize proto variable
 */
function initProto(obj) {
    var keys = Object.keys(obj)
    if (keys.length == 1) {
        proto = obj[keys[0]];
        return initProto(proto);
    } else {
        return obj;
    }
}

/**
 * Initialize numberTypes hashset
 */
function getNumberTypes() {
    var set = new HashSet();
    var types = ['fixed32', 'uint32', 'float', 'double'];
    types.forEach(function (type) {
        set.add(type);
    })
    return set;
}

/**
 * Initialize stringTypes hashset
 */
function getStringTypes() {
    var set = new HashSet();
    var types = ['string', 'bytes', 'fixed64', 'uint64', 'Timestamp', 'Duration', 'FieldMask'];
    types.forEach(function (type) {
        set.add(type);
    })
    return set;
}

/**
 * Method to fill functions with data
 */
function getOperationsData() {
    services.forEach(function (service) {
        var serviceName = service.name;
        var operations = [];
        // Fill functions with relevant data
        service.children.forEach(function (element) {
            var rpc = {
                name: element.name,
                request: {
                    name: element.resolvedRequestType.name,
                    isStream: element.requestStream
                },
                response: {
                    name: element.resolvedResponseType.name,
                    isStream: element.responseStream
                }
            };
            operations.push(rpc);
        });
        var serviceJSON = {
            serviceName: serviceName,
            operations: operations
        };
        serviceAndOperations.push(serviceJSON);
    });
}

/**
 * Method to fill messageTypes with data
 */
function getMessagesData() {
    services.forEach(function (service) {
        // Fill messageTypes with relevant data of requests
        service.children.forEach(function (element) {
            var request = element.resolvedRequestType;
            getMessages(request, request.name, 1);
            var response = element.resolvedResponseType;
            getMessages(response, response.name, 1);
        });
    });
}

/**
 * Recursiv function for nested messages
 */
function getMessages(message, messageName, limit) {
    // Depth limit to 10. If it is reached, stop!
    if (limit == 10) {
        return;
    }
    // Also stop iff message is already known
    if (messageTypes.has(messageName)) {
        return;
    }
    // Array for message fields
    var fields = [];
    var isEnum = false;
    // Set for local messages (only name)
    var nestedMessages = new HashSet();
    message.children.forEach(function (field) {
        if (field.className == 'Message') {
            nestedMessages.add(field.name);
            var nestedName = messageName + '_' + field.name;
            getMessages(field, nestedName, ++limit);
        }
    });
    // Iterate through all fields of message
    message.children.forEach(function (field) {
        if (field.className == 'Message.Field') {
            // Placeholder for field kind, e.g. object or string
            var fieldKind;
            // Placeholder for fieldtype
            var fieldType;
            // if field is of message type, pay attention
            if (field.type.name == 'message') {
                fieldKind = 'object';
                // Set fieldType to field message data type
                fieldType = field.resolvedType.name;
                if (nestedMessages.contains(fieldType)) {
                    // Set fieldType to local message type
                    fieldType = messageName + '_' + fieldType;
                } else {
                    // Call method recursively with field message datatype and limit + 1
                    getMessages(field.resolvedType, fieldType, ++limit);
                }
            } else if (field.type.name == 'enum') {
                fieldKind = 'enum';
                // Set fieldType to enum name
                fieldType = field.resolvedType.name;
                isEnum = true;
            } else {
                // In this case, the field is of primitive datatype,
                var fType = field.type.name;
                if (numberTypes.contains(fType)) {
                    fieldKind = 'number';
                } else if (stringTypes.contains(fType)) {
                    fieldKind = 'string';
                } else if (fType == 'bool') {
                    fieldKind = 'boolean';
                } else if (fType == 'int32' || fType == 'int64') {
                    fieldKind = 'integer';
                } else if (fType == 'Any' || fType == 'Struct') {
                    fieldKind = 'object' // Maybe additional reference field
                }
                // set fieldType to this datatype
                fieldType = fType; // TODO: Change other types
            }
            // Create field data
            var specificField = {
                name: field.name,
                type: fieldType,
                kind: fieldKind,
                isRepeated: field.repeated,
                id: field.id
            };
            if (isEnum) {
                specificField['enum'] = field.resolvedType.object;
            }
            // Push field data to fields Array
            fields.push(specificField);
        }
    });
    // Create message data an add to HashMap
    var specificMessage = {
        name: messageName,
        fields: fields
    };
    messageTypes.set(messageName, specificMessage);
}