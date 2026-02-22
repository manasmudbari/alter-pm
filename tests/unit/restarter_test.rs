// @group UnitTests : Exponential backoff logic tests

#[cfg(test)]
mod tests {
    use alter::process::restarter::backoff_delay;
    use std::time::Duration;

    // @group UnitTests > Restarter : Backoff grows exponentially
    #[test]
    fn test_backoff_doubles() {
        let base = 1000u64;
        assert_eq!(backoff_delay(base, 0), Duration::from_millis(1000));
        assert_eq!(backoff_delay(base, 1), Duration::from_millis(2000));
        assert_eq!(backoff_delay(base, 2), Duration::from_millis(4000));
        assert_eq!(backoff_delay(base, 3), Duration::from_millis(8000));
    }

    // @group EdgeCases : Backoff is capped at 60 seconds
    #[test]
    fn test_backoff_capped() {
        let base = 1000u64;
        let high = backoff_delay(base, 100);
        assert_eq!(high, Duration::from_millis(60_000));
    }

    // @group EdgeCases : exponent capped at 8 (256x)
    #[test]
    fn test_backoff_exponent_cap() {
        let base = 100u64;
        // 2^8 = 256, base * 256 = 25600ms < 60000ms
        assert_eq!(backoff_delay(base, 8), Duration::from_millis(25600));
        // exponent should not exceed 2^8
        assert_eq!(backoff_delay(base, 9), Duration::from_millis(25600));
        assert_eq!(backoff_delay(base, 20), Duration::from_millis(25600));
    }
}
