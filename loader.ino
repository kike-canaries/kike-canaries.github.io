
/**
 * CanAirIO easy OTA Loader
 * ========================
 * 
 * This sketch will able to load a basic client
 * for get the last version of CanAir.IO firmware.
 * 
 * You can run it from your Arduino IDE or from 
 * your Android phone using ArduinoDroid app with
 * OTG cable connected to your board.
 * 
 * Steps:
 * 
 * - Install Arduino JSON Library from Arduino Library Manager
 * - Choose ESP32 Dev Module or similar board
 * - Select partion schema to **minimal** (see README for details)
 * - Configure your WiFi credentials below
 * - Build & Upload, the last version of CanAirIO will be installed
 * - (optional) see the progress on Serial console or monitor.
 *
 * Complete documentation and video:
 * https://github.com/hpsaturn/esp32-canairio-loader#readme
 */

/***********************************
 *  S E T U P
 **********************************/ 

// !!!! Change to your WiFi credentials !!!
#define WIFINAME  "test_hotspot"
#define WIFIPASSW "testHS1234"

// Choose it, also works for similar boards 
// (ESP32 Wroover or ESP32Dev modules)

#define FLAVOR "TTGO_T7"

// #define FLAVOR "HELTEC"
// #define FLAVOR "ESP32DEVKIT"
// #define FLAVOR "WEMOSOLED"
// #define FLAVOR "TTGO_T7"

/***********************************
 *  E N D  O F  S E T U P
 **********************************/ 

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Update.h>
#include <WiFi.h>

int _payloadVersion;
String _host;
String _bin;
int _port;

String _endpoint="http://influxdb.canair.io:8080/releases/dev/firmware_";
int BASE_VERSION = 773;

bool wifiSetup() {
    Serial.print("-->[OTA] Connecting to ");
    Serial.print(WIFIPASSW);

    WiFi.begin(WIFINAME,WIFIPASSW);

    int connect_try=0;

    while (WiFi.status() != WL_CONNECTED && connect_try++ < 10) {
        delay(500);
        Serial.print(".");  
    }

    if (connect_try == 10) {
        Serial.println(" FAILED!");
        return false;
    }

    Serial.println(" SUCCESS!");
    return true;
}

bool execHTTPcheck() {
    String useURL = _endpoint + FLAVOR + ".json";
    _port = 80;
    Serial.printf("-->[OTA] Getting firmware params from : %s\n", useURL.c_str());
    if ((WiFi.status() == WL_CONNECTED)) {  

        HTTPClient http;

        http.begin(useURL);         
        int httpCode = http.GET(); 

        if (httpCode == 200) {  //Check is a file was returned

            String payload = http.getString();

            int str_len = payload.length() + 1;
            char JSONMessage[str_len];
            payload.toCharArray(JSONMessage, str_len);

            StaticJsonDocument<300> JSONDocument;  //Memory pool
            DeserializationError err = deserializeJson(JSONDocument, JSONMessage);

            if (err) {  //Check for errors in parsing
                Serial.println("Parsing failed");
                delay(5000);
                return false;
            }

            const char *pltype = JSONDocument["type"];
            int plversion = JSONDocument["version"];
            const char *plhost = JSONDocument["host"];
            _port = JSONDocument["port"];
            const char *plbin = JSONDocument["bin"];
            _payloadVersion = plversion;

            String jshost(plhost);
            String jsbin(plbin);

            _host = jshost;
            _bin = jsbin;

            String fwtype(pltype);

            if (plversion > BASE_VERSION && fwtype == FLAVOR) {
                return true;
            } else {
                return false;
            }
        }

        else {
            Serial.println("Error on HTTP request");
            return false;
        }

        http.end();  //Free the resources
        return false;
    }
    return false;
}

static void splitHeader(String src, String &header, String &headerValue) {
    int idx = 0;

    idx = src.indexOf(':');
    header = src.substring(0, idx);
    headerValue = src.substring(idx + 1, src.length());
    headerValue.trim();

    return;
}

void execOTA() {

    WiFiClient client;
    int contentLength = 0;
    bool isValidContentType = false;
    bool gotHTTPStatus = false;

    Serial.println("-->[OTA] Connecting to: " + String(_host));
    // Connect to Webserver
    if (client.connect(_host.c_str(), _port)) {
        // Connection Succeed.
        // Fetching the bin
        Serial.println("-->[OTA] Fetching Bin: " + String(_bin));

        // Get the contents of the bin file
        client.print(String("GET ") + _bin + " HTTP/1.1\r\n" +
                     "Host: " + _host + "\r\n" +
                     "Cache-Control: no-cache\r\n" +
                     "Connection: close\r\n\r\n");

        unsigned long timeout = millis();
        while (client.available() == 0) {
            if (millis() - timeout > 5000) {
                Serial.println("Client Timeout !");
                client.stop();
                return;
            }
        }

        while (client.available()) {
            String header, headerValue;
            String line = client.readStringUntil('\n');
            // remove space, to check if the line is end of headers
            line.trim();

            if (!line.length()) break; 

            // Check if the HTTP Response is 200
            // else break and Exit Update
            if (line.startsWith("HTTP/1.1")) {
                if (line.indexOf("200") < 0) {
                    Serial.println("-->[OTA] Got a non 200 status code from server. Exiting OTA Update.");
                    client.stop();
                    break;
                }
                gotHTTPStatus = true;
            }

            if (false == gotHTTPStatus) {
                continue;
            }

            splitHeader(line, header, headerValue);

            // extract headers here
            // Start with content length
            if (header.equalsIgnoreCase("Content-Length")) {
                contentLength = headerValue.toInt();
                Serial.println("-->[OTA] Got " + String(contentLength) + " bytes from server");
                continue;
            }

            // Next, the content type
            if (header.equalsIgnoreCase("Content-type")) {
                String contentType = headerValue;
                Serial.println("-->[OTA] Got " + contentType + " payload.");
                if (contentType == "application/octet-stream") {
                    isValidContentType = true;
                }
            }
        }
    } else {
        Serial.println("-->[OTA] Connection to " + String(_host) + " failed. Please check the last version of this loader.");
    }

    // Check what is the contentLength and if content type is `application/octet-stream`
    Serial.println("-->[OTA] contentLength : " + String(contentLength) + ", isValidContentType : " + String(isValidContentType));

    // Check contentLength and content type
    if (contentLength && isValidContentType) {
        // Check if there is enough to OTA Update
        bool canBegin = Update.begin(contentLength);

        // If yes, begin
        if (canBegin) {
            Serial.println("-->[OTA] Begin OTA. This may take 2 - 5 mins to complete. Patience!");
            size_t written = Update.writeStream(client);

            if (written == contentLength) {
                Serial.println("-->[OTA] Written : " + String(written) + " successfully");
            } else {
                Serial.println("-->[OTA] Written only : " + String(written) + "/" + String(contentLength) + ". Retry?");
                delay(2000);
            }

            if (Update.end()) {
                Serial.println("-->[OTA] OTA done!");
                if (Update.isFinished()) {
                    Serial.println("-->[OTA] Update successfully completed. Rebooting..");
                    delay(3000);
                    ESP.restart();
                } else {
                    Serial.println("-->[E][OTA] Update not finished? Something went wrong!");
                }
            } else {
                Serial.println("-->[E][OTA] Error Occurred. Error #: " + String(Update.getError()));
            }
        } else {
            Serial.println("-->[E][OTA] Not enough space to begin OTA, please check ESP32 board settings!");
            client.flush();
        }
    } else {
        Serial.println("-->[E][OTA] There was no content in the response");
        client.flush();
    }
}

void checkRemoteOTA() {
    bool updatedNeeded = execHTTPcheck();
    if (updatedNeeded) {
        Serial.println("-->[OTA] starting..");
        execOTA();
    } else
        Serial.println("-->[OTA] oops! something wrong!");
}

void setup() {
    Serial.begin(115200);
    delay(2000);
    Serial.println();
    while (!wifiSetup());
    delay(1000);
    checkRemoteOTA();
}

void loop() {
}
