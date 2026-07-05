//! macOS permission status + deep-links to the right System Settings panes
//! (SPEC §5). Uses framework-linked FFI (ApplicationServices / IOKit) - no extra
//! crates. On non-macOS platforms permissions are always "granted".

use crate::model::PermissionStatus;

#[cfg(target_os = "macos")]
mod imp {
    use super::PermissionStatus;
    use std::process::Command;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    // IOHIDCheckAccess returns IOHIDAccessType: 0 = granted, 1 = denied, 2 = unknown.
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDCheckAccess(request: u32) -> u32;
    }

    const K_IOHID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
    const K_IOHID_ACCESS_TYPE_GRANTED: u32 = 0;

    pub fn permission_status() -> PermissionStatus {
        let accessibility = unsafe { AXIsProcessTrusted() };
        let input_monitoring = unsafe {
            IOHIDCheckAccess(K_IOHID_REQUEST_TYPE_LISTEN_EVENT) == K_IOHID_ACCESS_TYPE_GRANTED
        };
        PermissionStatus {
            accessibility,
            input_monitoring,
        }
    }

    pub fn open_settings(which: &str) {
        let url = match which {
            "input_monitoring" => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
            }
            // default to accessibility
            _ => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        };
        let _ = Command::new("open").arg(url).spawn();
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::PermissionStatus;

    pub fn permission_status() -> PermissionStatus {
        PermissionStatus {
            accessibility: true,
            input_monitoring: true,
        }
    }

    pub fn open_settings(_which: &str) {}
}

pub use imp::{open_settings, permission_status};
