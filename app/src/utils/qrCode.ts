import { NativeModules, Platform } from "react-native";
import { AppType, reconstructAppType } from "../../../common/src/utils/appType";
import useNavigationStore from '../stores/navigationStore';

export const scanQRCode = () => {
    const { toast, setSelectedApp, setSelectedTab } = useNavigationStore.getState();

    if (Platform.OS === 'ios') {
        if (NativeModules.QRScannerBridge && NativeModules.QRScannerBridge.scanQRCode) {
            NativeModules.QRScannerBridge.scanQRCode()
                .then((result: string) => {
                    handleQRCodeScan(result, toast, setSelectedApp, setSelectedTab);
                })
                .catch((error: any) => {
                    console.error('QR Scanner Error:', error);
                    toast.show('Error', {
                        message: 'Failed to scan QR code',
                        type: 'error',
                    });
                });
        } else {
            console.error('QR Scanner module not found for iOS');
            toast.show('Error', {
                message: 'QR Scanner not available',
                type: 'error',
            });
        }
    } else if (Platform.OS === 'android') {
        if (NativeModules.QRCodeScanner && NativeModules.QRCodeScanner.scanQRCode) {
            NativeModules.QRCodeScanner.scanQRCode()
                .then((result: string) => {
                    handleQRCodeScan(result, toast, setSelectedApp, setSelectedTab);
                })
                .catch((error: any) => {
                    console.error('QR Scanner Error:', error);
                    toast.show('Error', {
                        message: 'Failed to scan QR code',
                        type: 'error',
                    });
                });
        } else {
            console.error('QR Scanner module not found for Android');
            toast.show('Error', {
                message: 'QR Scanner not available',
                type: 'error',
            });
        }
    }
};

const handleQRCodeScan = (result: string, toast: any, setSelectedApp: any, setSelectedTab: any) => {
    try {
        console.log(result);
        const parsedJson = JSON.parse(result);
        const app: AppType = reconstructAppType(parsedJson);
        setSelectedApp(app);
        setSelectedTab("prove");
        toast.show('✅', {
            message: "QR code scanned",
            customData: {
                type: "success",
            },
        })
    } catch (error) {
        console.error('Error parsing QR code result:', error);
        toast.show('Error', {
            message: "QR code parsing failed",
            customData: {
                type: "error",
            },
        })
    }
};